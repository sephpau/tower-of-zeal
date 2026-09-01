using UnityEngine;

// Ego's real spaceship — the cartoon white/blue jet modeled in Blender from
// the reference art (Assets/Resources/egoship.fbx, source: neon-void/egoship.blend).
// FBX materials are placeholders; they're remapped here by name onto the
// game's code-generated neon materials so the ship matches the world style
// (and so glass/emissive parts actually render as glass/emissive in WebGL).
public static class EgoShipModel
{
    const float TargetWidth = 5.8f;   // wingspan the old procedural ship had

    public static GameObject Attach(GameObject ship, ShipTint tint)
    {
        var prefab = Resources.Load<GameObject>("egoship");
        if (prefab == null) return null;   // model missing — caller falls back to the procedural saucer

        var model = Object.Instantiate(prefab, ship.transform);
        model.name = "egoshipModel";
        model.transform.localPosition = Vector3.zero;

        // Blender export: nose faces +Z in Unity, up +Y (verified via ShowcaseShot).
        // Compose with the importer's own axis-correction, never overwrite it.
        model.transform.localRotation = Quaternion.Euler(0f, 0f, 0f) * model.transform.localRotation;

        // normalize wingspan so FBX unit-scale differences can't change gameplay size
        var renderers = model.GetComponentsInChildren<Renderer>();
        if (renderers.Length > 0)
        {
            var b = renderers[0].bounds;
            foreach (var r in renderers) b.Encapsulate(r.bounds);
            if (b.size.x > 0.0001f)
                model.transform.localScale = Vector3.one * (TargetWidth / b.size.x);

            // recenter the visual on the ship pivot
            b = renderers[0].bounds;
            foreach (var r in renderers) b.Encapsulate(r.bounds);
            model.transform.position += ship.transform.position - b.center;
        }

        foreach (var r in renderers)
        {
            var mats = r.sharedMaterials;
            for (int i = 0; i < mats.Length; i++)
                mats[i] = Remap(mats[i], r, tint);
            r.sharedMaterials = mats;
        }

        foreach (var col in model.GetComponentsInChildren<Collider>())
            Object.Destroy(col);
        return model;
    }

    static Material Remap(Material src, Renderer r, ShipTint tint)
    {
        string n = src != null ? src.name : "";
        if (n.Contains("HullWhite")) return White;
        if (n.Contains("HullBlue")) return Blue;
        if (n.Contains("DarkBlue")) return Dark;
        if (n.Contains("Yellow")) return YellowMat;
        if (n.Contains("Canopy")) return Glass;
        if (n.Contains("EngineGlow") || n.Contains("GrilleCyan"))
        {
            // engine discs + grille glow neon cyan and follow pilot tinting
            var mr = r as MeshRenderer;
            if (mr != null && tint != null) tint.accentParts.Add(mr);
            return NVAssets.CyanEmissive;
        }
        if (n.Contains("PilotPink")) return Pink;
        if (n.Contains("PilotDark")) return Dark;
        return White;
    }

    // one shared instance per look, lazily built (NVAssets.Standard makes a new material per call)
    static Material _white, _blue, _dark, _yellow, _glass, _pink;
    static Material White => _white != null ? _white : _white = NVAssets.Standard(new Color(0.90f, 0.90f, 0.95f), 0.35f, 0.35f);
    static Material Blue => _blue != null ? _blue : _blue = NVAssets.Standard(new Color(0.16f, 0.38f, 0.62f), 0.4f, 0.3f);
    static Material Dark => _dark != null ? _dark : _dark = NVAssets.Standard(new Color(0.08f, 0.12f, 0.24f), 0.5f, 0.3f);
    static Material YellowMat => _yellow != null ? _yellow : _yellow = NVAssets.Standard(new Color(1f, 0.78f, 0.15f), 0.2f, 0.35f);
    static Material Glass => _glass != null ? _glass : _glass = NVAssets.StandardFade(new Color(0.5f, 0.85f, 1f, 0.22f), 0.9f, 0.03f);
    static Material Pink => _pink != null ? _pink : _pink = NVAssets.Standard(new Color(0.92f, 0.32f, 0.42f), 0.05f, 0.55f);
}
