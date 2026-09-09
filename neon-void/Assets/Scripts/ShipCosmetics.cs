using UnityEngine;

// Battle pass cosmetics on the player ship. Trails recolor and lengthen the
// booster trails and add a wide wake; the gilded skin tints the hull gold.
public static class ShipCosmetics
{
    public static void Apply(GameObject ship, MetaBridge.Cosmetics c)
    {
        var old = ship.transform.Find("cosmeticWake");
        if (old != null) Object.Destroy(old.gameObject);
        if (c == null) return;

        // hangar hull: a boss warship worn as a skin (premium pass unlock, chosen in the Armory)
        string hull = PlayerPrefs.GetString("nv_hull", "");
        if (!string.IsNullOrEmpty(hull) && c.bossShips != null && System.Array.IndexOf(c.bossShips, hull) >= 0)
            DoomHull.MountSkin(ship, hull);

        var tint = ship.GetComponent<ShipTint>();
        Color? trailColor = null;
        if (c.trail == "void") trailColor = new Color(0.72f, 0.3f, 1f);
        else if (c.trail == "ember") trailColor = new Color(1f, 0.6f, 0.15f);
        if (trailColor.HasValue && tint != null)
        {
            var col = trailColor.Value;
            foreach (var tr in tint.trails)
            {
                if (tr == null) continue;
                tr.time = 1.1f;
                tr.startWidth *= 1.5f;
                tr.startColor = new Color(col.r, col.g, col.b, 0.95f);
                tr.endColor = new Color(col.r, col.g, col.b, 0f);
            }
            // a wide, soft wake down the ship's centre line
            var wake = new GameObject("cosmeticWake");
            wake.transform.SetParent(ship.transform, false);
            wake.transform.localPosition = new Vector3(0f, 0f, -1.6f);
            var w = wake.AddComponent<TrailRenderer>();
            w.time = 1.6f;
            w.startWidth = 2.2f;
            w.endWidth = 0.1f;
            w.minVertexDistance = 0.3f;
            w.material = NVAssets.AdditiveTinted(col);
            w.startColor = new Color(col.r, col.g, col.b, 0.35f);
            w.endColor = new Color(col.r, col.g, col.b, 0f);
            if (tint.engineLight != null) tint.engineLight.color = col;
        }

        if (c.skin == "gilded")
        {
            var visual = ship.transform.Find("visual");
            var root = visual != null ? visual : ship.transform;
            foreach (var r in root.GetComponentsInChildren<Renderer>())
            {
                if (r.GetComponent<TrailRenderer>() != null || r.GetComponent<Billboard>() != null) continue;
                foreach (var m in r.materials)
                {
                    if (!m.HasProperty("_Color")) continue;
                    m.color = new Color(1f, 0.86f, 0.45f);
                    if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", 0.85f);
                    if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0.8f);
                }
            }
        }
    }
}
