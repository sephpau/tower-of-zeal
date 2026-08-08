using UnityEngine;

// Loads the real Ego character model (Assets/Resources/ego.fbx, exported
// from Blender out of the Ego Run assets) and places him in the world.
public static class EgoModel
{
    // model's forward after FBX import — tune here if he faces the wrong way
    public const float YawFix = 180f;

    // per-model posture trim: (pitch, roll) degrees — ego's sculpt leans
    // sideways a little
    static Vector2 PostureTrim(string resource) => resource == "ego" ? new Vector2(0f, -12f) : Vector2.zero;

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

// Start-screen showpieces: Ego and Captain Ego drifting and spinning
// on either side of the camera.
public class EgoShowcase : MonoBehaviour
{
    public float spin = 18f;
    float _t;
    Vector3 _anchor;
    float _seed;
    float _yaw;

    public static void Create(Camera cam)
    {
        CreateOne(cam, "ego", 2.6f, +2.6f, 18f);
        CreateOne(cam, "captain", 2.75f, -2.6f, -18f);
    }

    static void CreateOne(Camera cam, string resource, float scale, float side, float spin)
    {
        var holder = new GameObject(resource + "Showcase");
        var model = EgoModel.Spawn(holder.transform, Vector3.zero, scale, resource);
        if (model == null) { Object.Destroy(holder); Debug.LogWarning("Showcase: Resources/" + resource + " not found"); return; }
        holder.transform.position = cam.transform.position + cam.transform.forward * 5f
            + cam.transform.right * side - cam.transform.up * 1.2f;
        var sc = holder.AddComponent<EgoShowcase>();
        sc.spin = spin;

        var l = new GameObject(resource + "Light").AddComponent<Light>();
        l.transform.SetParent(holder.transform, false);
        l.transform.localPosition = new Vector3(1.5f, 2f, -2f);
        l.type = LightType.Point;
        l.intensity = 2.2f;
        l.range = 12f;
        l.color = new Color(1f, 0.9f, 0.85f);
    }

    void Start()
    {
        _anchor = transform.position;
        _seed = Random.value * 100f;
        _yaw = Random.value * 360f;
    }

    void Update()
    {
        _t += Time.deltaTime;

        // slow noise-driven drift around the anchor — weightless wandering
        Vector3 wander = new Vector3(
            (Mathf.PerlinNoise(_seed, _t * 0.06f) - 0.5f) * 2f * 2.6f,
            (Mathf.PerlinNoise(_seed + 17f, _t * 0.08f) - 0.5f) * 2f * 1.6f,
            (Mathf.PerlinNoise(_seed + 41f, _t * 0.045f) - 0.5f) * 2f * 1.8f);
        transform.position = _anchor + wander;

        // steady spin with a gentle zero-g rock
        _yaw += spin * Time.deltaTime;
        float rockX = Mathf.Sin(_t * 0.5f + _seed) * 7f;
        float rockZ = Mathf.Sin(_t * 0.37f + _seed * 2f) * 8f;
        transform.rotation = Quaternion.Euler(rockX, _yaw, rockZ);

        if (GameManager.I != null && GameManager.I.Running)
            Destroy(gameObject);
    }
}
