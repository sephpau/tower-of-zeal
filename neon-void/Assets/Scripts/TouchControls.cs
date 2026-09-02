using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

// Mobile touch controls: left stick = WASD, right stick = aim, hold
// buttons for up/down thrust, tap buttons for dash/guard/special/actives.
// On touch mode the primary weapon auto-fires. Layout is player-editable
// (Settings → Edit Touch Layout) and persists in PlayerPrefs.
//
// IMPORTANT: all gameplay input here is polled straight from Input.touches
// (with a mouse fallback) — NOT from EventSystem pointer events. On iOS
// Safari the browser only synthesizes single mouse events from touches, so
// EventSystem drags freeze at the first position; raw touches track fine.
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

// virtual joystick — driven by TouchControls' raw touch polling
public class TouchStick : MonoBehaviour
{
    public RectTransform knob;
    public float radius = 78f;
    public Vector2 Value { get; private set; }
    public int finger = -1;   // pointer id currently steering, -1 = free

    RectTransform _rt;
    void Awake() { _rt = GetComponent<RectTransform>(); }

    public void Track(Vector2 screenPos)
    {
        RectTransformUtility.ScreenPointToLocalPointInRectangle(_rt, screenPos, null, out var p);
        Value = Vector2.ClampMagnitude(p / radius, 1f);
        if (knob != null) knob.anchoredPosition = Value * radius;
    }

    public void Release()
    {
        finger = -1;
        Value = Vector2.zero;
        if (knob != null) knob.anchoredPosition = Vector2.zero;
    }
}

// drag-to-aim pad: swipes over the right half of the screen turn the ship
public class TouchAimPad : MonoBehaviour
{
    public static Vector2 Delta;   // accumulated finger movement, consumed per frame
    public int finger = -1;
}

public class TouchControls : MonoBehaviour
{
    const string LayoutKey = "zsv2-touch-layout";
    const float LookSpeed = 170f;   // deg/sec at full right-stick deflection
    const int MouseId = -7;         // pseudo pointer id for the mouse fallback

    public bool editMode;
    TouchStick _stickL, _stickR;
    TouchAimPad _pad;
    readonly Dictionary<string, Vector2> _anchors = new Dictionary<string, Vector2>();
    // claim order matters: earlier entries win the touch. The aim pad is
    // appended last so buttons floating over it still get their taps.
    readonly List<(RectTransform rt, string id)> _hit = new List<(RectTransform, string)>();
    readonly Dictionary<int, string> _owner = new Dictionary<int, string>();
    readonly Dictionary<int, Vector2> _lastPos = new Dictionary<int, Vector2>();
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

    // classic analog look: procedural antialiased circle + ring sprites
    static Sprite _circle, _ring;

    static Sprite CircleSprite()
    {
        if (_circle != null) return _circle;
        _circle = MakeRound(false);
        return _circle;
    }

    static Sprite RingSprite()
    {
        if (_ring != null) return _ring;
        _ring = MakeRound(true);
        return _ring;
    }

    static Sprite MakeRound(bool ring)
    {
        const int S = 128;
        var tex = new Texture2D(S, S, TextureFormat.RGBA32, false);
        var px = new Color[S * S];
        float c = (S - 1) / 2f, r = S / 2f - 2f;
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                float d = Mathf.Sqrt((x - c) * (x - c) + (y - c) * (y - c));
                float a = Mathf.Clamp01(r - d);
                if (ring) a *= Mathf.Clamp01(d - (r - 7f));
                px[y * S + x] = new Color(1f, 1f, 1f, a);
            }
        tex.SetPixels(px);
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, S, S), new Vector2(0.5f, 0.5f));
    }

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

    // saved (or default) anchor for one element — the HUD uses this to park
    // the skill icons exactly on the player's button layout
    public static Vector2 LayoutAnchor(string id)
    {
        var d = Defaults();
        Vector2 a = d.ContainsKey(id) ? d[id] : new Vector2(0.5f, 0.5f);
        foreach (var part in PlayerPrefs.GetString(LayoutKey, "").Split(';'))
        {
            var bits = part.Split(':');
            if (bits.Length != 2 || bits[0] != id) continue;
            var xy = bits[1].Split(',');
            if (xy.Length == 2 && float.TryParse(xy[0], out float x) && float.TryParse(xy[1], out float y))
                a = new Vector2(x, y);
        }
        return a;
    }

    public void OnMoved(string id, Vector2 anchor) => _anchors[id] = anchor;

    void BuildElements()
    {
        bool dragAim = !editMode && GameSettings.TouchAimMode == 1;

        // drag-aim pad drawn first (bottom) so every stick/button renders over
        // it; it's appended to the hit list LAST so it only claims bare swipes
        GameObject padGo = null;
        if (dragAim)
        {
            padGo = new GameObject("aimPad");
            padGo.transform.SetParent(transform, false);
            var prt = padGo.AddComponent<RectTransform>();
            prt.anchorMin = new Vector2(0.5f, 0f); prt.anchorMax = Vector2.one;
            prt.offsetMin = Vector2.zero; prt.offsetMax = Vector2.zero;
            var pimg = padGo.AddComponent<Image>();
            pimg.color = new Color(0f, 0f, 0f, 0.001f);
            _pad = padGo.AddComponent<TouchAimPad>();
        }

        foreach (var (id, label, size) in Elements)
        {
            if (id == "joyR" && dragAim) continue;   // drag mode replaces the right stick
            var el = new GameObject(id);
            el.transform.SetParent(transform, false);
            var rt = el.AddComponent<RectTransform>();
            rt.anchorMin = rt.anchorMax = _anchors[id];
            rt.sizeDelta = new Vector2(size, size);
            _hit.Add((rt, id));

            // skill buttons carry the HUD's own icons + cooldown sweeps in play
            // mode (LayoutSkillHud parks them here) — draw nothing of our own,
            // just a touch target; the layout editor still shows them
            bool hudBacked = !editMode &&
                (id == "special" || id == "s1" || id == "s2" || id == "s3" || id == "s4");

            // sticks and action buttons are circular like a classic analog pad;
            // only the wide UP/DOWN thrust buttons stay rounded rectangles
            bool circular = id != "up" && id != "down";
            var img = el.AddComponent<Image>();
            if (circular) { img.sprite = CircleSprite(); img.type = Image.Type.Simple; }
            else { img.sprite = _fill; img.type = Image.Type.Sliced; }
            img.color = new Color(0.15f, 0.12f, 0.32f, hudBacked ? 0.004f : editMode ? 0.85f : 0.42f);
            if (!hudBacked)
            {
                var edge = new GameObject("edge");
                edge.transform.SetParent(el.transform, false);
                var edgeImg = edge.AddComponent<Image>();
                if (circular) { edgeImg.sprite = RingSprite(); edgeImg.type = Image.Type.Simple; }
                else { edgeImg.sprite = _outline; edgeImg.type = Image.Type.Sliced; }
                edgeImg.raycastTarget = false;
                var edgeRt = edgeImg.rectTransform;
                edgeRt.anchorMin = Vector2.zero; edgeRt.anchorMax = Vector2.one;
                edgeRt.offsetMin = Vector2.zero; edgeRt.offsetMax = Vector2.zero;
                edgeImg.color = new Color(0.55f, 0.8f, 1f, editMode ? 0.9f : 0.5f);
            }

            if (!string.IsNullOrEmpty(label) && !hudBacked)
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

            if (!editMode && (id == "joyL" || id == "joyR"))
            {
                var knob = new GameObject("knob");
                knob.transform.SetParent(el.transform, false);
                var kimg = knob.AddComponent<Image>();
                kimg.sprite = CircleSprite(); kimg.type = Image.Type.Simple;
                kimg.color = new Color(0.55f, 0.8f, 1f, 0.55f);
                kimg.raycastTarget = false;
                var krt = kimg.rectTransform;
                krt.anchorMin = krt.anchorMax = new Vector2(0.5f, 0.5f);
                krt.sizeDelta = new Vector2(86, 86);
                var stick = el.AddComponent<TouchStick>();
                stick.knob = krt;
                stick.radius = size * 0.34f;
                if (id == "joyL") _stickL = stick; else _stickR = stick;
            }
        }

        if (padGo != null)
            _hit.Add(((RectTransform)padGo.transform, "aimpad"));
    }

    // ---------- raw pointer pump ----------

    void Update()
    {
        // gather live pointers: real touches, or the mouse standing in for one
        // (desktop testing with touch controls forced ON)
        for (int i = 0; i < Input.touchCount; i++)
        {
            var t = Input.GetTouch(i);
            HandlePointer(t.fingerId, t.position, t.phase);
        }
        if (Input.touchCount == 0)
        {
            if (Input.GetMouseButtonDown(0)) HandlePointer(MouseId, Input.mousePosition, TouchPhase.Began);
            else if (Input.GetMouseButton(0)) HandlePointer(MouseId, Input.mousePosition, TouchPhase.Moved);
            else if (Input.GetMouseButtonUp(0)) HandlePointer(MouseId, Input.mousePosition, TouchPhase.Ended);
        }

        if (editMode) return;
        TouchInput.Move = _stickL != null ? _stickL.Value : Vector2.zero;
        if (GameSettings.TouchAimMode == 1)
        {
            // drag-to-aim: finger movement maps straight to degrees
            TouchInput.Look = TouchAimPad.Delta * 0.22f * GameSettings.MouseSensitivity;
            TouchAimPad.Delta = Vector2.zero;
        }
        else
        {
            TouchInput.Look = (_stickR != null ? _stickR.Value : Vector2.zero)
                * LookSpeed * GameSettings.MouseSensitivity * Time.unscaledDeltaTime;
        }
    }

    void HandlePointer(int id, Vector2 pos, TouchPhase phase)
    {
        if (phase == TouchPhase.Began)
        {
            foreach (var (rt, elId) in _hit)
            {
                if (!RectTransformUtility.RectangleContainsScreenPoint(rt, pos, null)) continue;
                if (elId == "joyL" && _stickL != null && _stickL.finger != -1) continue;
                if (elId == "joyR" && _stickR != null && _stickR.finger != -1) continue;
                if (elId == "aimpad" && _pad != null && _pad.finger != -1) continue;
                _owner[id] = elId;
                _lastPos[id] = pos;
                Press(elId, id, pos);
                break;
            }
            return;
        }

        if (!_owner.TryGetValue(id, out string tgt)) return;

        if (phase == TouchPhase.Moved || phase == TouchPhase.Stationary)
        {
            Drag(tgt, id, pos);
            _lastPos[id] = pos;
        }
        else if (phase == TouchPhase.Ended || phase == TouchPhase.Canceled)
        {
            Release(tgt);
            _owner.Remove(id);
            _lastPos.Remove(id);
        }
    }

    void Press(string elId, int id, Vector2 pos)
    {
        if (editMode) return;   // editor: press just claims, drag moves
        switch (elId)
        {
            case "joyL": _stickL.finger = id; _stickL.Track(pos); break;
            case "joyR": _stickR.finger = id; _stickR.Track(pos); break;
            case "aimpad": _pad.finger = id; break;
            case "up": TouchInput.Up = true; break;
            case "down": TouchInput.Down = true; break;
            case "dash": TouchInput.PressDash(); break;
            case "guard": TouchInput.PressGuard(); break;
            case "special": TouchInput.PressSpecial(); break;
            case "s1": TouchInput.PressSkill(0); break;
            case "s2": TouchInput.PressSkill(1); break;
            case "s3": TouchInput.PressSkill(2); break;
            case "s4": TouchInput.PressSkill(3); break;
        }
    }

    void Drag(string elId, int id, Vector2 pos)
    {
        if (editMode)
        {
            // layout editor: slide the element's anchor under the finger
            var canvasRt = (RectTransform)transform;
            Vector2 delta = pos - _lastPos[id];
            Vector2 a = _anchors[elId] + new Vector2(delta.x / canvasRt.rect.width, delta.y / canvasRt.rect.height);
            a.x = Mathf.Clamp01(a.x); a.y = Mathf.Clamp01(a.y);
            foreach (var (rt, hid) in _hit)
                if (hid == elId) { rt.anchorMin = rt.anchorMax = a; break; }
            OnMoved(elId, a);
            return;
        }
        switch (elId)
        {
            case "joyL": _stickL.Track(pos); break;
            case "joyR": _stickR.Track(pos); break;
            case "aimpad": TouchAimPad.Delta += pos - _lastPos[id]; break;
        }
    }

    void Release(string elId)
    {
        if (editMode) return;
        switch (elId)
        {
            case "joyL": _stickL.Release(); break;
            case "joyR": _stickR.Release(); break;
            case "aimpad": _pad.finger = -1; break;
            case "up": TouchInput.Up = false; break;
            case "down": TouchInput.Down = false; break;
        }
    }

    void OnDisable()
    {
        _owner.Clear();
        _lastPos.Clear();
        TouchInput.Move = Vector2.zero;
        TouchInput.Look = Vector2.zero;
        TouchInput.Up = TouchInput.Down = false;
        if (_stickL != null) _stickL.Release();
        if (_stickR != null) _stickR.Release();
    }
}
