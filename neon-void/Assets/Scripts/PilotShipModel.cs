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
            // MULTIPLY the imported scale (Tripo FBX roots come in at 100x) —
            // replacing it outright shrinks the ship to invisibility
            if (b.size.x > 0.0001f)
                model.transform.localScale = model.transform.localScale * (TargetWidth / b.size.x);
            b = renderers[0].bounds;
            foreach (var r in renderers) b.Encapsulate(r.bounds);
            model.transform.position += ship.transform.position - b.center;
        }

        // apply the baked color map directly — embedded FBX textures don't
        // survive Unity's material import, so we carry them as plain images
        var baseTex = Resources.Load<Texture2D>("ships/tex/ship_" + pilotId + "_basecolor");
        if (baseTex != null)
        {
            foreach (var r in renderers)
                foreach (var m in r.materials)
                {
                    m.mainTexture = baseTex;
                    m.color = Color.white;
                    if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0.35f);
                    if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", 0.1f);
                }
        }

        foreach (var col in model.GetComponentsInChildren<Collider>())
            Object.Destroy(col);

        // line the classic booster glow + trails + engine light up with this
        // hull's twin exhaust grilles (all four Tripo ships share the layout),
        // in each ship's own booster color
        var tint = ship.GetComponent<ShipTint>();
        if (tint != null)
        {
            // grilles measured from the rear renders: ±26% of half-span,
            // mid-hull height; orbs sit just BEHIND the tail, not inside it
            Color booster = BoosterColor(pilotId);
            for (int i = 0; i < tint.glowQuads.Count && i < 2; i++)
            {
                float side = i == 0 ? -1f : 1f;
                tint.glowQuads[i].transform.localPosition = new Vector3(side * 0.75f, 0.15f, -2.75f);
                tint.glowQuads[i].transform.localScale = Vector3.one * 0.72f;
                tint.glowQuads[i].material.SetColor("_TintColor", booster);
            }
            for (int i = 0; i < tint.trails.Count && i < 2; i++)
            {
                float side = i == 0 ? -1f : 1f;
                tint.trails[i].transform.localPosition = new Vector3(side * 0.75f, 0.15f, -2.85f);
                tint.trails[i].startColor = new Color(booster.r, booster.g, booster.b, 0.85f);
                tint.trails[i].endColor = new Color(booster.r * 0.6f, booster.g * 0.4f, booster.b, 0f);
            }
            if (tint.engineLight != null)
            {
                tint.engineLight.transform.localPosition = new Vector3(0f, 0.2f, -2.8f);
                tint.engineLight.color = booster;
            }
        }
        return true;
    }

    // per-ship booster flame colors
    static Color BoosterColor(string pilotId) => pilotId switch
    {
        "captain" => new Color(0.75f, 0.48f, 0.22f),   // brown-amber
        "chef" => new Color(1f, 0.28f, 0.2f),          // red
        "lunar" => new Color(0.78f, 0.3f, 1f),         // neon violet
        _ => new Color(0.25f, 0.55f, 1f),              // ego — blue
    };
}
