using UnityEditor;
using UnityEngine;

// Headless diagnostic for the per-pilot ship prefabs:
//   Unity.exe -batchmode -quit -executeMethod ShipDebug.Run
public static class ShipDebug
{
    [MenuItem("Zeal Survivors/Debug Ships")]
    public static void Run()
    {
        foreach (var id in new[] { "ego", "captain", "chef", "lunar" })
        {
            var prefab = Resources.Load<GameObject>("ships/ship_" + id);
            if (prefab == null) { Debug.Log("[shipdbg] " + id + ": PREFAB NULL"); continue; }
            var go = Object.Instantiate(prefab);
            var rs = go.GetComponentsInChildren<Renderer>(true);
            Debug.Log("[shipdbg] " + id + ": renderers=" + rs.Length +
                " rootScale=" + go.transform.localScale.ToString("F4") +
                " children=" + go.transform.childCount);
            if (rs.Length > 0)
            {
                var b = rs[0].bounds;
                foreach (var r in rs) b.Encapsulate(r.bounds);
                Debug.Log("[shipdbg] " + id + ": boundsSize=" + b.size.ToString("F4") + " center=" + b.center.ToString("F4") +
                    " mat0=" + (rs[0].sharedMaterial != null ? rs[0].sharedMaterial.shader.name : "NULL"));
                // simulate PilotShipModel normalization
                if (b.size.x > 0.0001f) go.transform.localScale = Vector3.one * (5.8f / b.size.x);
                var b2 = rs[0].bounds;
                foreach (var r in rs) b2.Encapsulate(r.bounds);
                Debug.Log("[shipdbg] " + id + ": afterScale=" + go.transform.localScale.x.ToString("F4") +
                    " newSize=" + b2.size.ToString("F4"));
            }
            Object.DestroyImmediate(go);
        }
        Debug.Log("[shipdbg] done");
    }
}
