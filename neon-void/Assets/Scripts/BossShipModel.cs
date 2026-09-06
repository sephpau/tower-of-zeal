using UnityEngine;

// Hand-made boss hulls (Resources/ships/boss_<id>.fbx + tex/boss_<id>_basecolor.jpg).
// The procedural silhouette stays as the gameplay rig (collider, turret muzzles,
// engine glows) but its meshes are hidden and the imported hull is mounted in
// their place, sized by its largest dimension and yawed so the nose is +Z.
public static class BossShipModel
{
    public static bool Mount(GameObject go, string id, float size, float yaw, bool fadeCapable)
    {
        var prefab = Resources.Load<GameObject>("ships/boss_" + id);
        if (prefab == null) return false;

        // hide the placeholder geometry, keep the additive glow billboards
        foreach (var mr in go.GetComponentsInChildren<MeshRenderer>())
            if (mr.GetComponent<Billboard>() == null) mr.enabled = false;

        var model = Object.Instantiate(prefab, go.transform);
        model.name = "bossModel";
        model.transform.localPosition = Vector3.zero;
        // keep the FBX import rotation (Tripo roots carry the axis fix) and yaw on top of it
        model.transform.localRotation = Quaternion.AngleAxis(yaw, Vector3.up) * model.transform.localRotation;

        var rends = model.GetComponentsInChildren<Renderer>();
        if (rends.Length > 0)
        {
            var b = rends[0].bounds;
            foreach (var r in rends) b.Encapsulate(r.bounds);
            float big = Mathf.Max(b.size.x, b.size.y, b.size.z);
            if (big > 0.0001f) model.transform.localScale = model.transform.localScale * (size / big);
            b = rends[0].bounds;
            foreach (var r in rends) b.Encapsulate(r.bounds);
            model.transform.position += go.transform.position - b.center;
        }

        var tex = Resources.Load<Texture2D>("ships/tex/boss_" + id + "_basecolor");
        foreach (var r in rends)
            foreach (var m in r.materials)
            {
                if (tex != null) { m.mainTexture = tex; m.color = Color.white; }
                if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0.4f);
                if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", 0.15f);
                if (fadeCapable && m.HasProperty("_Mode"))
                {
                    // Standard shader Fade mode so the smuggler cloak can drop the alpha
                    m.SetFloat("_Mode", 2f);
                    m.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
                    m.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
                    m.SetInt("_ZWrite", 0);
                    m.DisableKeyword("_ALPHATEST_ON");
                    m.EnableKeyword("_ALPHABLEND_ON");
                    m.DisableKeyword("_ALPHAPREMULTIPLY_ON");
                    m.renderQueue = 3000;
                }
            }
        foreach (var c in model.GetComponentsInChildren<Collider>()) Object.Destroy(c);
        return true;
    }
}
