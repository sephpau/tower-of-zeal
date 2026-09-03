using System.Collections.Generic;
using UnityEngine;

// Rotating 3D ship previews glued to the pilot-select UI: each card gets its
// pilot's real hull turning on a turntable beside the portrait, and the
// custom hangar previews whichever ship is currently picked. Positions are
// given in reference-canvas pixels and projected into world space in front
// of the menu camera every frame, so they track the UI at any aspect ratio.
public class ShipShowcase : MonoBehaviour
{
    const float Depth = 7f;
    static readonly List<GameObject> Live = new List<GameObject>();
    static GameObject _pair;

    Camera _cam;
    RectTransform _canvas;
    Vector2 _px;
    float _spin;
    Transform _model;

    // the four select cards — only rebuilt when nothing is showing
    public static void ShowSelect(RectTransform canvas)
    {
        if (Live.Count > 0) return;
        for (int i = 0; i < ZealData.Pilots.Length; i++)
        {
            var go = Spawn(canvas, ZealData.Pilots[i].id, new Vector2((i - 1.5f) * 330f + 69f, 111f), 1.25f);
            if (go != null) Live.Add(go);
        }
    }

    // custom hangar: the currently chosen ship, previewed under the cards
    public static void ShowPair(RectTransform canvas, string shipId)
    {
        if (_pair != null) Destroy(_pair);
        _pair = Spawn(canvas, shipId, new Vector2(0f, -238f), 1.15f);
    }

    public static void Clear()
    {
        foreach (var g in Live) if (g != null) Destroy(g);
        Live.Clear();
        if (_pair != null) { Destroy(_pair); _pair = null; }
    }

    static GameObject Spawn(RectTransform canvas, string pilotId, Vector2 px, float width)
    {
        var cam = Camera.main;
        if (cam == null) return null;
        var prefab = Resources.Load<GameObject>("ships/ship_" + pilotId);
        if (prefab == null) return null;

        var holder = new GameObject("showcase-" + pilotId);
        var model = Instantiate(prefab, holder.transform);
        var rends = model.GetComponentsInChildren<Renderer>();
        if (rends.Length > 0)
        {
            var b = rends[0].bounds;
            foreach (var r in rends) b.Encapsulate(r.bounds);
            if (b.size.x > 0.0001f) model.transform.localScale *= width / b.size.x;
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

        var l = new GameObject("light").AddComponent<Light>();
        l.transform.SetParent(holder.transform, false);
        l.transform.localPosition = new Vector3(1.2f, 1.6f, -1.6f);
        l.type = LightType.Point;
        l.intensity = 2.4f;
        l.range = 9f;

        var sc = holder.AddComponent<ShipShowcase>();
        sc._cam = cam;
        sc._canvas = canvas;
        sc._px = px;
        sc._model = model.transform;
        sc._spin = Random.Range(30f, 45f);
        sc.Place();
        return holder;
    }

    void Update()
    {
        if (GameManager.I != null && GameManager.I.Running) { Destroy(gameObject); return; }
        if (_cam == null) return;
        Place();
        if (_model != null) _model.Rotate(0f, _spin * Time.unscaledDeltaTime, 0f, Space.World);
    }

    void Place()
    {
        var t = _cam.transform;
        float halfH = Mathf.Tan(_cam.fieldOfView * 0.5f * Mathf.Deg2Rad) * Depth;
        float halfW = halfH * _cam.aspect;
        float cw = _canvas != null ? _canvas.rect.width : 1920f;
        float ch = _canvas != null ? _canvas.rect.height : 1080f;
        transform.position = t.position + t.forward * Depth
            + t.right * (_px.x / (cw * 0.5f)) * halfW
            + t.up * (_px.y / (ch * 0.5f)) * halfH;
        // nose toward the viewer, tilted so the top deck reads
        transform.rotation = Quaternion.LookRotation(-t.forward, t.up) * Quaternion.Euler(-18f, 0f, 0f);
    }
}
