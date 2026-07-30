using UnityEngine;

// Assembles the player fighter from primitives: dark hull, cyan neon
// stripes, pink fins, engine glows with trails — Space Strike's ship, in 3D.
public static class PlayerShipFactory
{
    public static GameObject Build(Vector3 pos)
    {
        var ship = new GameObject("PlayerShip");
        ship.transform.position = pos;

        var hull = NVAssets.Hull;
        var cyan = NVAssets.CyanEmissive;
        var pink = NVAssets.PinkEmissive;

        AddPart(ship, PrimitiveType.Cube, new Vector3(0f, 0f, 0.4f), new Vector3(1.0f, 0.55f, 3.2f), Quaternion.identity, hull);
        // nose cone (stretched sphere reads better than Unity's capsule here)
        AddPart(ship, PrimitiveType.Sphere, new Vector3(0f, 0f, 2.4f), new Vector3(0.7f, 0.45f, 1.9f), Quaternion.identity, hull);
        // canopy
        AddPart(ship, PrimitiveType.Sphere, new Vector3(0f, 0.42f, 0.9f), new Vector3(0.5f, 0.35f, 1.1f), Quaternion.identity, cyan);

        foreach (float side in new[] { -1f, 1f })
        {
            var wingRot = Quaternion.Euler(0f, 0f, side * 12f);
            AddPart(ship, PrimitiveType.Cube, new Vector3(side * 1.8f, -0.1f, -0.3f), new Vector3(2.6f, 0.09f, 1.5f), wingRot, hull);
            AddPart(ship, PrimitiveType.Cube, new Vector3(side * 1.85f, -0.06f, 0.25f), new Vector3(2.4f, 0.1f, 0.16f), wingRot, cyan);
            AddPart(ship, PrimitiveType.Cube, new Vector3(side * 3.0f, 0.25f, -0.6f), new Vector3(0.08f, 0.8f, 1.0f), wingRot, pink);

            // engine glow + trail
            var glow = NVAssets.Quad(NVAssets.AdditiveTinted(new Color(0.4f, 0.95f, 1f)), 1.4f);
            glow.transform.SetParent(ship.transform, false);
            glow.transform.localPosition = new Vector3(side * 0.6f, 0f, -1.7f);
            glow.AddComponent<Billboard>();

            var trailGo = new GameObject("trail");
            trailGo.transform.SetParent(ship.transform, false);
            trailGo.transform.localPosition = new Vector3(side * 0.6f, 0f, -1.8f);
            var trail = trailGo.AddComponent<TrailRenderer>();
            trail.time = 0.35f;
            trail.startWidth = 0.45f;
            trail.endWidth = 0.02f;
            trail.material = NVAssets.Additive;
            trail.startColor = new Color(0.35f, 0.9f, 1f, 0.85f);
            trail.endColor = new Color(0.6f, 0.3f, 1f, 0f);
            trail.minVertexDistance = 0.4f;
        }

        var engineLight = new GameObject("engineLight").AddComponent<Light>();
        engineLight.transform.SetParent(ship.transform, false);
        engineLight.transform.localPosition = new Vector3(0f, 0f, -2f);
        engineLight.type = LightType.Point;
        engineLight.color = new Color(0.4f, 0.9f, 1f);
        engineLight.intensity = 2.4f;
        engineLight.range = 9f;

        var col = ship.AddComponent<BoxCollider>();
        col.center = new Vector3(0f, 0f, 0.4f);
        col.size = new Vector3(4.5f, 0.9f, 4.5f);

        var rb = ship.AddComponent<Rigidbody>();
        rb.useGravity = false;
        rb.mass = 3f;
        rb.linearDamping = 0.6f;
        rb.angularDamping = 4f;
        rb.interpolation = RigidbodyInterpolation.Interpolate;
        rb.collisionDetectionMode = CollisionDetectionMode.Continuous;

        var health = ship.AddComponent<Health>();
        health.Configure(100f, 60f, player: true);

        var weapon = ship.AddComponent<Weapon>();
        weapon.isPlayerWeapon = true;
        weapon.fireInterval = 0.12f;
        weapon.projectileSpeed = 240f;
        weapon.damage = 11f;
        weapon.boltColor = new Color(0.35f, 0.95f, 1f);
        var muzzles = new Transform[2];
        for (int i = 0; i < 2; i++)
        {
            var m = new GameObject("muzzle" + i).transform;
            m.SetParent(ship.transform, false);
            m.localPosition = new Vector3(i == 0 ? -1.9f : 1.9f, -0.05f, 1.2f);
            muzzles[i] = m;
        }
        weapon.muzzles = muzzles;

        ship.AddComponent<ShipController>();
        return ship;
    }

    static void AddPart(GameObject parent, PrimitiveType type, Vector3 pos, Vector3 scale, Quaternion rot, Material mat)
    {
        var p = GameObject.CreatePrimitive(type);
        Object.Destroy(p.GetComponent<Collider>());
        p.transform.SetParent(parent.transform, false);
        p.transform.localPosition = pos;
        p.transform.localScale = scale;
        p.transform.localRotation = rot;
        p.GetComponent<MeshRenderer>().sharedMaterial = mat;
    }
}
