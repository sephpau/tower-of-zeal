using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

// Mobile touch controls: left stick = WASD, right stick = aim, hold
// buttons for up/down thrust, tap buttons for dash/guard/special/actives.
// On touch mode the primary weapon auto-fires. Layout is player-editable
// (Settings → Edit Touch Layout) and persists in PlayerPrefs.
public static class TouchInput
{
    public static bool Enabled;
    public static Vector2 Move;      // left stick: x strafe, y forward
    public static Vector2 Look;      // per-frame aim delta in degrees
    public static bool Up, Down;     // held thrust buttons

    static bool _dash, _guard, _special;
    static readonly bool[] _sk = new bool[4];

    public static void PressDash() { _dash = true; }
    public static void PressGuard() { _guard = true; }
    public static void PressSpecial() { _special = true; }
    public static void PressSkill(int i) { if (i >= 0 && i < 4) _sk[i] = true; }
    public static bool ConsumeDash() { bool v = _dash; _dash = false; return v; }
    public static bool ConsumeGuard() { bool v = _guard; _guard = false; return v; }
    public static bool ConsumeSpecial() { bool v = _special; _special = false; return v; }
    public static bool ConsumeSkill(int i) { if (i < 0 || i >= 4 || !_sk[i]) return false; _sk[i] = false; return true; }
}

// virtual joystick: drag inside the base to deflect the knob
public class TouchStick : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
{
    public RectTransform knob;
    public float radius = 78f;
    public Vector2 Value { get; private set; }

    RectTransform _rt;
    void Awake() { _rt = GetComponent<RectTransform>(); }

    void Track(PointerEventData e)
    {
        RectTransformUtility.ScreenPointToLocalPointInRectangle(_rt, e.position, e.pressEventCamera, out var p);
        Value = Vector2.ClampMagnitude(p / radius, 1f);
        if (knob != null) knob.anchoredPosition = Value * radius;
    }

    public void OnPointerDown(PointerEventData e) => Track(e);
    public void OnDrag(PointerEventData e) => Track(e);
    public void OnPointerUp(PointerEventData e)
    {
        Value = Vector2.zero;
        if (knob != null) knob.anchoredPosition = Vector2.zero;
    }
}

// layout-editor drag handle: moves the element's anchor point
public class TouchDraggable : MonoBehaviour, IDragHandler
{
    public string id;
    public TouchControls owner;

    public void OnDrag(PointerEventData e)
    {
        var rt = (RectTransform)transform;
        var canvasRt = (RectTransform)owner.transform;
        Vector2 delta = new Vector2(e.delta.x / canvasRt.rect.width, e.delta.y / canvasRt.rect.height);
        Vector2 a = rt.anchorMin + delta;
        a.x = Mathf.Clamp01(a.x); a.y = Mathf.Clamp01(a.y);
        rt.anchorMin = rt.anchorMax = a;
        owner.OnMoved(id, a);
    }
}

public class TouchControls : MonoBehaviour
{
    const string LayoutKey = "zsv2-touch-layout";
    const float LookSpeed = 170f;   // deg/sec at full right-stick deflection

    public bool editMode;
    TouchStick _stickL, _stickR;
    readonly Dictionary<string, Vector2> _anchors = new Dictionary<string, Vector2>();
    Sprite _fill, _outline;
    Font _font;

    static readonly (string id, string label, float size)[] Elements = {
        ("joyL", "", 230f), ("joyR", "", 230f),
        ("up", "UP", 120f), ("down", "DOWN", 120f),
        ("s1", "S1", 74f), ("s2", "S2", 74f), ("s3", "S3", 74f), ("s4", "S4", 74f),
        ("special", "SPC", 96f), ("dash", "DASH", 84f), ("guard", "SHLD", 84f),
    };

    static Dictionary<string, Vector2> Defaults() => new Dictionary<string, Vector2> {
        { "joyL", new Vector2(0.115f, 0.26f) }, { "joyR", new Vector2(0.885f, 0.26f) },
        { "up", new Vector2(0.07f, 0.9f) }, { "down", new Vector2(0.93f, 0.9f) },
        { "s1", new Vector2(0.665f, 0.30f) }, { "s2", new Vector2(0.70f, 0.45f) },
        { "s3", new Vector2(0.755f, 0.57f) }, { "s4", new Vector2(0.825f, 0.65f) },
        { "special", new Vector2(0.525f, 0.13f) }, { "dash", new Vector2(0.60f, 0.17f) },
        { "guard", new Vector2(0.675f, 0.13f) },
    };

    public static TouchControls Build(Transform parent, Sprite fill, Sprite outline, bool editMode)
    {
        var go = new GameObject(editMode ? "touchLayoutEditor" : "touchControls");
        go.transform.SetParent(parent, false);
        var rt = go.AddComponent<RectTransform>();
        rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
        rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
        var tc = go.AddComponent<TouchControls>();
        tc.editMode = editMode;
        tc._fill = fill; tc._outline = outline;
        tc._font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        tc.LoadLayout();
        tc.BuildElements();
        return tc;
    }

    void LoadLayout()
    {
        foreach (var kv in Defaults()) _anchors[kv.Key] = kv.Value;
        string raw = PlayerPrefs.GetString(LayoutKey, "");
        foreach (var part in raw.Split(';'))
        {
            var bits = part.Split(':');
            if (bits.Length != 2) continue;
            var xy = bits[1].Split(',');
            if (xy.Length == 2 && float.TryParse(xy[0], out float x) && float.TryParse(xy[1], out float y))
                _anchors[bits[0]] = new Vector2(x, y);
        }
    }

    public void SaveLayout()
    {
        var parts = new List<string>();
        foreach (var kv in _anchors)
            parts.Add(kv.Key + ":" + kv.Value.x.ToString("F4") + "," + kv.Value.y.ToString("F4"));
        PlayerPrefs.SetString(LayoutKey, string.Join(";", parts));
        PlayerPrefs.Save();
    }

    public static void ResetLayout() { PlayerPrefs.DeleteKey(LayoutKey); PlayerPrefs.Save(); }

    public void OnMoved(string id, Vector2 anchor) => _anchors[id] = anchor;

    void BuildElements()
    {
        foreach (var (id, label, size) in Elements)
        {
            var el = new GameObject(id);
            el.transform.SetParent(transform, false);
            var rt = el.AddComponent<RectTransform>();
            rt.anchorMin = rt.anchorMax = _anchors[id];
            rt.sizeDelta = new Vector2(size, size);

            var img = el.AddComponent<Image>();
            img.sprite = _fill; img.type = Image.Type.Sliced;
            img.color = new Color(0.15f, 0.12f, 0.32f, editMode ? 0.85f : 0.42f);
            var edge = new GameObject("edge");
            edge.transform.SetParent(el.transform, false);
            var edgeImg = edge.AddComponent<Image>();
            edgeImg.sprite = _outline; edgeImg.type = Image.Type.Sliced;
            edgeImg.raycastTarget = false;
            var edgeRt = edgeImg.rectTransform;
            edgeRt.anchorMin = Vector2.zero; edgeRt.anchorMax = Vector2.one;
            edgeRt.offsetMin = Vector2.zero; edgeRt.offsetMax = Vector2.zero;
            edgeImg.color = new Color(0.55f, 0.8f, 1f, editMode ? 0.9f : 0.5f);

            if (!string.IsNullOrEmpty(label))
            {
                var txt = new GameObject("label").AddComponent<Text>();
                txt.transform.SetParent(el.transform, false);
                txt.font = _font; txt.fontSize = id == "up" || id == "down" ? 20 : 17;
                txt.fontStyle = FontStyle.Bold;
                txt.alignment = TextAnchor.MiddleCenter;
                txt.color = new Color(0.85f, 0.92f, 1f, 0.9f);
                txt.text = label;
                txt.raycastTarget = false;
                var trt = txt.rectTransform;
                trt.anchorMin = Vector2.zero; trt.anchorMax = Vector2.one;
                trt.offsetMin = Vector2.zero; trt.offsetMax = Vector2.zero;
            }

            if (editMode)
            {
                var drag = el.AddComponent<TouchDraggable>();
                drag.id = id; drag.owner = this;
                continue;   // editor: drag only, no gameplay wiring
            }

            if (id == "joyL" || id == "joyR")
            {
                var knob = new GameObject("knob");
                knob.transform.SetParent(el.transform, false);
                var kimg = knob.AddComponent<Image>();
                kimg.sprite = _fill; kimg.type = Image.Type.Sliced;
                kimg.color = new Color(0.55f, 0.8f, 1f, 0.55f);
                kimg.raycastTarget = false;
                var krt = kimg.rectTransform;
                krt.anchorMin = krt.anchorMax = new Vector2(0.5f, 0.5f);
                krt.sizeDelta = new Vector2(86, 86);
                var stick = el.AddComponent<TouchStick>();
                stick.knob = krt;
                stick.radius = size * 0.34f;
                if (id == "joyL") _stickL = stick; else _stickR = stick;
                continue;
            }

            // held vs tap buttons
            var trig = el.AddComponent<EventTrigger>();
            void On(EventTriggerType type, UnityEngine.Events.UnityAction<BaseEventData> cb)
            {
                var entry = new EventTrigger.Entry { eventID = type };
                entry.callback.AddListener(cb);
                trig.triggers.Add(entry);
            }
            switch (id)
            {
                case "up":
                    On(EventTriggerType.PointerDown, _ => TouchInput.Up = true);
                    On(EventTriggerType.PointerUp, _ => TouchInput.Up = false);
                    break;
                case "down":
                    On(EventTriggerType.PointerDown, _ => TouchInput.Down = true);
                    On(EventTriggerType.PointerUp, _ => TouchInput.Down = false);
                    break;
                case "dash": On(EventTriggerType.PointerDown, _ => TouchInput.PressDash()); break;
                case "guard": On(EventTriggerType.PointerDown, _ => TouchInput.PressGuard()); break;
                case "special": On(EventTriggerType.PointerDown, _ => TouchInput.PressSpecial()); break;
                case "s1": On(EventTriggerType.PointerDown, _ => TouchInput.PressSkill(0)); break;
                case "s2": On(EventTriggerType.PointerDown, _ => TouchInput.PressSkill(1)); break;
                case "s3": On(EventTriggerType.PointerDown, _ => TouchInput.PressSkill(2)); break;
                case "s4": On(EventTriggerType.PointerDown, _ => TouchInput.PressSkill(3)); break;
            }
        }
    }

    void Update()
    {
        if (editMode) return;
        TouchInput.Move = _stickL != null ? _stickL.Value : Vector2.zero;
        TouchInput.Look = (_stickR != null ? _stickR.Value : Vector2.zero)
            * LookSpeed * GameSettings.MouseSensitivity * Time.unscaledDeltaTime;
    }

    void OnDisable()
    {
        TouchInput.Move = Vector2.zero;
        TouchInput.Look = Vector2.zero;
        TouchInput.Up = TouchInput.Down = false;
    }
}
