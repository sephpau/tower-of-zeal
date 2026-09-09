using UnityEngine;

// The Decimator flies Doom's own warship: the pilot hull is hidden and the
// boss_doom model mounts on the same visual root at ~2.4x the ship footprint.
// Unmount restores the pilot hull exactly as it was.
public static class DoomHull
{
    const float Width = 5.8f * 2.4f;

    // the Decimator's warship: Doom, 2.4x, over whatever hull the ship wears
    public static bool Mount(GameObject ship) => MountAs(ship, "doom", "doomHull", Width);

    // any boss hull as a cosmetic skin (premium pass hangar unlocks), pilot-sized
    public static bool MountSkin(GameObject ship, string bossId) => MountAs(ship, bossId, "bossHull", 5.8f * 1.35f);

    static bool MountAs(GameObject ship, string bossId, string childName, float width)
    {
        var parent = ship.transform.Find("visual");
        if (parent == null) parent = ship.transform;
        if (parent.Find(childName) != null) return true;
        var prefab = Resources.Load<GameObject>("ships/boss_" + bossId);
        if (prefab == null) return false;

        foreach (string n in new[] { "egoshipModel", "pilotShipModel", "bossHull" })
        {
            if (n == childName) continue;
            var t = parent.Find(n);
            if (t != null) t.gameObject.SetActive(false);
        }

        var model = Object.Instantiate(prefab, parent);
        model.name = childName;
        model.transform.localPosition = Vector3.zero;
        // Doom's export faces -Z: half-turn on top of the FBX axis fix
        if (bossId == "doom") model.transform.localRotation = Quaternion.AngleAxis(180f, Vector3.up) * model.transform.localRotation;

        var rends = model.GetComponentsInChildren<Renderer>();
        if (rends.Length > 0)
        {
            var b = rends[0].bounds;
            foreach (var r in rends) b.Encapsulate(r.bounds);
            if (b.size.x > 0.0001f) model.transform.localScale = model.transform.localScale * (width / b.size.x);
            b = rends[0].bounds;
            foreach (var r in rends) b.Encapsulate(r.bounds);
            model.transform.position += ship.transform.position - b.center;
        }
        var tex = Resources.Load<Texture2D>("ships/tex/boss_" + bossId + "_basecolor");
        foreach (var r in rends)
            foreach (var m in r.materials)
            {
                if (tex != null) { m.mainTexture = tex; m.color = Color.white; }
                if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0.4f);
                if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", 0.15f);
            }
        foreach (var c in model.GetComponentsInChildren<Collider>()) Object.Destroy(c);
        return true;
    }

    public static void Unmount(GameObject ship)
    {
        if (ship == null) return;
        var parent = ship.transform.Find("visual");
        if (parent == null) parent = ship.transform;
        var d = parent.Find("doomHull");
        if (d != null) Object.Destroy(d.gameObject);
        // back to the hangar skin if one is worn, else the pilot hull
        var skin = parent.Find("bossHull");
        if (skin != null) { skin.gameObject.SetActive(true); return; }
        foreach (string n in new[] { "egoshipModel", "pilotShipModel" })
        {
            var t = parent.Find(n);
            if (t != null) t.gameObject.SetActive(true);
        }
    }
}
