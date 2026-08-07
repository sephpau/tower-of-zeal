using UnityEngine;

// Loads the real Ego character model (Assets/Resources/ego.fbx, exported
// from Blender out of the Ego Run assets) and places him in the world.
public static class EgoModel
{
    // model's forward after FBX import — tune here if he faces the wrong way
    public const float YawFix = 180f;

    public static GameObject Spawn(Transform parent, Vector3 localPos, float scale)
    {
        var prefab = Resources.Load<GameObject>("ego");
        if (prefab == null) return null;   // model not imported — game still works
        var ego = Object.Instantiate(prefab, parent);
        ego.name = "EgoModel";
        ego.transform.localPosition = localPos;
        ego.transform.localRotation = Quaternion.Euler(0f, YawFix, 0f);
        ego.transform.localScale = Vector3.one * scale;
        foreach (var col in ego.GetComponentsInChildren<Collider>())
            Object.Destroy(col);
        return ego;
    }
}

// Start-screen showpiece: Ego drifting and spinning in front of the camera.
public class EgoShowcase : MonoBehaviour
{
    float _t;

    public static void Create(Camera cam)
    {
        var holder = new GameObject("EgoShowcase");
        var ego = EgoModel.Spawn(holder.transform, Vector3.zero, 2.6f);
        if (ego == null) { Object.Destroy(holder); Debug.LogWarning("EgoShowcase: Resources/ego not found"); return; }
        holder.transform.position = cam.transform.position + cam.transform.forward * 5f
            + cam.transform.right * 2.6f - cam.transform.up * 1.2f;
        holder.AddComponent<EgoShowcase>();

        var l = new GameObject("egoLight").AddComponent<Light>();
        l.transform.SetParent(holder.transform, false);
        l.transform.localPosition = new Vector3(1.5f, 2f, -2f);
        l.type = LightType.Point;
        l.intensity = 2.2f;
        l.range = 12f;
        l.color = new Color(1f, 0.9f, 0.85f);
    }

    void Update()
    {
        _t += Time.deltaTime;
        transform.Rotate(0f, 18f * Time.deltaTime, 0f, Space.World);
        transform.position += Vector3.up * Mathf.Sin(_t * 1.1f) * 0.0016f;
        if (GameManager.I != null && GameManager.I.Running)
            Destroy(gameObject);
    }
}
