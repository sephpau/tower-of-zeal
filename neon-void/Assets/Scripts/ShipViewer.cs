using UnityEngine;

// Full-screen look at one pilot's hull: drag (or touch-drag) to turn it,
// scroll to zoom, idles into a slow turntable when left alone. Lives in
// world space in front of the menu camera like the select-screen previews.
public class ShipViewer : MonoBehaviour
{
    static GameObject _live;
    Camera _cam;
    Transform _model;
    float _dist = 6.5f, _yaw, _pitch = 12f, _idle;
    Vector3 _lastMouse;
    bool _dragging;

    public static bool IsOpen => _live != null;

    public static void Open(string pilotId)
    {
        Close();
        var cam = Camera.main;
        var prefab = Resources.Load<GameObject>("ships/ship_" + pilotId);
        if (cam == null || prefab == null) return;

        var holder = new GameObject("shipViewer");
        var model = Instantiate(prefab, holder.transform);
        var rends = model.GetComponentsInChildren<Renderer>();
        if (rends.Length > 0)
        {
            var b = rends[0].bounds;
            foreach (var r in rends) b.Encapsulate(r.bounds);
            float big = Mathf.Max(b.size.x, b.size.y, b.size.z);
            if (big > 0.0001f) model.transform.localScale *= 4.2f / big;
            b = rends[0].bounds;
            foreach (var r in rends) b.Encapsulate(r.bounds);
            model.transform.position += holder.transform.position - b.center;
        }
        var tex = Resources.Load<Texture2D>("ships/tex/ship_" + pilotId + "_basecolor");
        if (tex != null)
            foreach (var r in rends)
                foreach (var m in r.materials)
                {
                    m.mainTexture = tex;
                    m.color = Color.white;
                    if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0.35f);
                    if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", 0.1f);
                }
        foreach (var c in model.GetComponentsInChildren<Collider>()) Destroy(c);

        var key = new GameObject("key").AddComponent<Light>();
        key.transform.SetParent(holder.transform, false);
        key.transform.localPosition = new Vector3(2.5f, 3f, -3f);
        key.type = LightType.Point; key.intensity = 3.2f; key.range = 16f;
        var fill = new GameObject("fill").AddComponent<Light>();
        fill.transform.SetParent(holder.transform, false);
        fill.transform.localPosition = new Vector3(-3f, -1f, -2f);
        fill.type = LightType.Point; fill.intensity = 1.4f; fill.range = 14f;
        fill.color = new Color(0.6f, 0.7f, 1f);

        var v = holder.AddComponent<ShipViewer>();
        v._cam = cam;
        v._model = model.transform;
        v._yaw = 35f;
        v.Place();
        _live = holder;
    }

    public static void Close()
    {
        if (_live != null) Destroy(_live);
        _live = null;
    }

    void Update()
    {
        if (GameManager.I != null && GameManager.I.Running) { Close(); return; }
        if (_cam == null) return;
        float dt = Time.unscaledDeltaTime;

        Vector2 delta = Vector2.zero;
        bool held = false;
        if (Input.touchCount > 0)
        {
            var t = Input.GetTouch(0);
            held = true;
            if (t.phase == TouchPhase.Moved) delta = t.deltaPosition * 0.35f;
        }
        else if (Input.GetMouseButton(0))
        {
            held = true;
            if (_dragging) delta = (Vector2)(Input.mousePosition - _lastMouse) * 0.35f;
            _lastMouse = Input.mousePosition;
        }
        _dragging = held;
        if (held && delta.sqrMagnitude > 0f)
        {
            _yaw -= delta.x;
            _pitch = Mathf.Clamp(_pitch + delta.y, -75f, 75f);
            _idle = 0f;
        }
        else if (!held)
        {
            _idle += dt;
            if (_idle > 2.5f) _yaw += 18f * dt;   // turntable when left alone
        }
        float scroll = Input.mouseScrollDelta.y;
        if (Mathf.Abs(scroll) > 0.01f) _dist = Mathf.Clamp(_dist - scroll * 0.6f, 3.5f, 14f);
        Place();
    }

    void Place()
    {
        var t = _cam.transform;
        transform.position = t.position + t.forward * _dist - t.up * 0.25f;
        // nose toward the viewer, then the player's drag on top
        var basis = Quaternion.LookRotation(-t.forward, t.up);
        transform.rotation = Quaternion.AngleAxis(_yaw, t.up) * Quaternion.AngleAxis(_pitch, t.right) * basis;
    }
}
