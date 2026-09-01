using UnityEngine;

// Per-pilot spaceships (Resources/ships/ship_<pilot>.fbx, baked textures).
// Mounted at run start for the chosen pilot, replacing whatever ship model
// is on the visual root. Follows EgoShipModel's conventions: wingspan
// normalized to the classic footprint and recentered on the ship pivot.
public static class PilotShipModel
{
    const float TargetWidth = 5.8f;

    public static bool Swap(GameObject ship, string pilotId)
    {
        var prefab = Resources.Load<GameObject>("ships/ship_" + pilotId);
        if (prefab == null) return false;   // no per-pilot model — keep what's mounted

        var parent = ship.transform.Find("visual");
        if (parent == null) parent = ship.transform;
        foreach (string old in new[] { "egoshipModel", "pilotShipModel" })
        {
            var t = parent.Find(old);
            if (t != null) Object.Destroy(t.gameObject);
        }

        var model = Object.Instantiate(prefab, parent);
        model.name = "pilotShipModel";
        model.transform.localPosition = Vector3.zero;

        var renderers = model.GetComponentsInChildren<Renderer>();
        if (renderers.Length > 0)
        {
            var b = renderers[0].bounds;
            foreach (var r in renderers) b.Encapsulate(r.bounds);
            if (b.size.x > 0.0001f)
                model.transform.localScale = Vector3.one * (TargetWidth / b.size.x);
            b = renderers[0].bounds;
            foreach (var r in renderers) b.Encapsulate(r.bounds);
            model.transform.position += ship.transform.position - b.center;
        }

        foreach (var col in model.GetComponentsInChildren<Collider>())
            Object.Destroy(col);
        return true;
    }
}
