using UnityEngine;

// Loads the real Ego character model (Assets/Resources/ego.fbx, exported
// from Blender out of the Ego Run assets) and places him in the world.
public static class EgoModel
{
    // model's forward after FBX import — tune here if he faces the wrong way
    public const float YawFix = 0f;

    // per-model posture trim: (pitch, roll) degrees — ego's sculpt leans
    // sideways a little
    static Vector2 PostureTrim(string resource) => resource == "ego" ? new Vector2(0f, 12f) : Vector2.zero;

    // `size` is the desired world height — the model is measured after
    // instantiation and normalized, so FBX unit-scale differences between
    // exports (ego vs captain) can never make one invisible.
    public static GameObject Spawn(Transform parent, Vector3 localPos, float size, string resource = "ego")
    {
        var prefab = Resources.Load<GameObject>(resource);
        if (prefab == null) return null;   // model not imported — game still works
        var ego = Object.Instantiate(prefab, parent);
        ego.name = resource + "Model";
        ego.transform.localPosition = localPos;
        // compose yaw + posture trim with the importer's axis-correction
        // rotation — overwriting it lays Z-up models flat on their backs
        Vector2 trim = PostureTrim(resource);
        ego.transform.localRotation = Quaternion.Euler(trim.x, YawFix, trim.y) * ego.transform.localRotation;
        ego.transform.localScale = Vector3.one;

        var renderers = ego.GetComponentsInChildren<Renderer>();
        if (renderers.Length > 0)
        {
            var bounds = renderers[0].bounds;
            foreach (var r in renderers) bounds.Encapsulate(r.bounds);
            float h = Mathf.Max(bounds.size.x, bounds.size.y, bounds.size.z);
            if (h > 0.0001f)
                ego.transform.localScale = Vector3.one * (size / h);
        }

        foreach (var col in ego.GetComponentsInChildren<Collider>())
            Object.Destroy(col);
        return ego;
    }
}

// Start-screen showpieces: Ego and Captain Ego facing the camera,
// gliding across the whole screen and bouncing off the edges —
// classic idle-DVD-logo style.
public class EgoShowcase : MonoBehaviour
{
    const float Depth = 6.5f;   // distance in front of the camera

    Camera _cam;
    Vector2 _pos, _vel;
    float _halfSize;

    public static void Create(Camera cam)
    {
        CreateOne(cam, "ego", 2.6f, +3.2f);
        CreateOne(cam, "captain", 2.75f, -3.2f);
    }

    static void CreateOne(Camera cam, string resource, float size, float startX)
    {
        var holder = new GameObject(resource + "Showcase");
        var model = EgoModel.Spawn(holder.transform, Vector3.zero, size, resource);
        if (model == null) { Object.Destroy(holder); Debug.LogWarning("Showcase: Resources/" + resource + " not found"); return; }

        var sc = holder.AddComponent<EgoShowcase>();
        sc._cam = cam;
        sc._halfSize = size * 0.55f;
        sc._pos = new Vector2(startX, Random.Range(-1f, 1f));
        // diagonal launch, DVD style — never purely horizontal or vertical
        float angle = Random.Range(25f, 65f) * Mathf.Deg2Rad;
        float speed = Random.Range(0.9f, 1.3f);
        sc._vel = new Vector2(Mathf.Cos(angle) * (Random.value < 0.5f ? -1f : 1f),
                              Mathf.Sin(angle) * (Random.value < 0.5f ? -1f : 1f)) * speed;
        sc.Place();

        var l = new GameObject(resource + "Light").AddComponent<Light>();
        l.transform.SetParent(holder.transform, false);
        l.transform.localPosition = new Vector3(1.5f, 2f, -2f);
        l.type = LightType.Point;
        l.intensity = 2.2f;
        l.range = 12f;
        l.color = new Color(1f, 0.9f, 0.85f);
    }

    void Update()
    {
        if (_cam == null) return;
        _pos += _vel * Time.deltaTime;

        // bounce inside the camera frustum at our depth
        float halfH = Mathf.Tan(_cam.fieldOfView * 0.5f * Mathf.Deg2Rad) * Depth - _halfSize;
        float halfW = halfH_WithAspect(halfH);
        if (_pos.x > halfW) { _pos.x = halfW; _vel.x = -Mathf.Abs(_vel.x); }
        if (_pos.x < -halfW) { _pos.x = -halfW; _vel.x = Mathf.Abs(_vel.x); }
        if (_pos.y > halfH) { _pos.y = halfH; _vel.y = -Mathf.Abs(_vel.y); }
        if (_pos.y < -halfH) { _pos.y = -halfH; _vel.y = Mathf.Abs(_vel.y); }
        Place();

        if (GameManager.I != null && GameManager.I.Running)
            Destroy(gameObject);
    }

    float halfH_WithAspect(float halfH) =>
        (halfH + _halfSize) * _cam.aspect - _halfSize;

    void Place()
    {
        var t = _cam.transform;
        transform.position = t.position + t.forward * Depth + t.right * _pos.x + t.up * _pos.y;
        transform.rotation = Quaternion.LookRotation(t.forward, t.up) * Quaternion.identity;
    }
}
