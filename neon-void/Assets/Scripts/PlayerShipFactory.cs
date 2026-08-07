using UnityEngine;

// The player fighter: lathed fuselage, bubble canopy, swept airfoil wings,
// underslung engine nacelles with glow and trails. Smooth-shaded, no boxes.
public static class PlayerShipFactory
{
    public static GameObject Build(Vector3 pos)
    {
        var ship = new GameObject("PlayerShip");
        ship.transform.position = pos;

        var hullMat = NVAssets.Standard(new Color(0.32f, 0.34f, 0.44f), 0.85f, 0.25f);
        var darkMat = NVAssets.Standard(new Color(0.12f, 0.12f, 0.2f), 0.7f, 0.3f);
        var cyan = NVAssets.CyanEmissive;
        var pink = NVAssets.PinkEmissive;
        var glassMat = NVAssets.Standard(new Color(0.08f, 0.2f, 0.3f), 0.9f, 0.05f);
        glassMat.EnableKeyword("_EMISSION");
        glassMat.SetColor("_EmissionColor", new Color(0.1f, 0.5f, 0.8f) * 0.7f);

        // fuselage: sleek revolve, nose at +Z
        Vector2[] fuselage = {
            new Vector2(0.001f,  3.4f),
            new Vector2(0.14f,   2.9f),
            new Vector2(0.30f,   2.1f),
            new Vector2(0.42f,   1.1f),
            new Vector2(0.48f,   0.0f),
            new Vector2(0.46f,  -0.9f),
            new Vector2(0.36f,  -1.7f),
            new Vector2(0.26f,  -2.0f),
            new Vector2(0.001f, -2.0f),
        };
        NVMeshes.Part(ship, NVMeshes.Lathe(fuselage), hullMat, Vector3.zero, Vector3.zero, Vector3.one);

        // dorsal spine + canopy bubble
        NVMeshes.SpherePart(ship, glassMat, new Vector3(0f, 0.38f, 0.9f), new Vector3(0.55f, 0.42f, 1.5f));
        NVMeshes.SpherePart(ship, darkMat, new Vector3(0f, 0.2f, -0.7f), new Vector3(0.5f, 0.35f, 1.8f));

        // the pilot himself, seated under the glass, head in the bubble
        EgoModel.Spawn(ship.transform, new Vector3(0f, 0.3f, 0.72f), 0.5f);

        var wingMesh = NVMeshes.Wing(2.9f, 2.1f, 0.7f, 1.6f, 0.16f);
        var finMesh = NVMeshes.Wing(1.0f, 0.9f, 0.35f, 0.55f, 0.1f);

        foreach (float side in new[] { -1f, 1f })
        {
            // main wing, swept back, slight anhedral
            NVMeshes.Part(ship, wingMesh, hullMat,
                new Vector3(side * 0.42f, -0.06f, 0.1f),
                new Vector3(0f, 0f, side > 0 ? -4f : 184f),
                new Vector3(side > 0 ? 1f : 1f, 1f, 1f));
            // neon leading-edge stripe
            var stripe = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Object.Destroy(stripe.GetComponent<Collider>());
            stripe.transform.SetParent(ship.transform, false);
            stripe.transform.localPosition = new Vector3(side * 1.85f, -0.12f, 0.72f);
            stripe.transform.localRotation = Quaternion.Euler(0f, side * 28f, 0f);
            stripe.transform.localScale = new Vector3(2.9f, 0.05f, 0.07f);
            stripe.GetComponent<MeshRenderer>().sharedMaterial = cyan;

            // vertical tail fins, canted out, pink edge
            NVMeshes.Part(ship, finMesh, darkMat,
                new Vector3(side * 0.55f, 0.25f, -1.5f),
                new Vector3(0f, 0f, side > 0 ? 68f : 112f),   // V-tail: both fins cant up-outward
                Vector3.one);
            var finEdge = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Object.Destroy(finEdge.GetComponent<Collider>());
            finEdge.transform.SetParent(ship.transform, false);
            finEdge.transform.localPosition = new Vector3(side * 0.95f, 0.72f, -1.75f);
            finEdge.transform.localRotation = Quaternion.Euler(0f, 0f, side * 22f);
            finEdge.transform.localScale = new Vector3(0.06f, 0.9f, 0.09f);
            finEdge.GetComponent<MeshRenderer>().sharedMaterial = pink;

            // engine nacelle under each wing
            Vector2[] nacelle = {
                new Vector2(0.001f, 0.9f),
                new Vector2(0.16f,  0.7f),
                new Vector2(0.22f,  0.1f),
                new Vector2(0.20f, -0.55f),
                new Vector2(0.14f, -0.75f),
                new Vector2(0.001f,-0.75f),
            };
            var nac = NVMeshes.Part(ship, NVMeshes.Lathe(nacelle, 16), darkMat,
                new Vector3(side * 1.15f, -0.28f, -0.7f), Vector3.zero, Vector3.one);

            var glow = NVAssets.Quad(NVAssets.AdditiveTinted(new Color(0.4f, 0.95f, 1f)), 1.1f);
            glow.transform.SetParent(ship.transform, false);
            glow.transform.localPosition = new Vector3(side * 1.15f, -0.28f, -1.55f);
            glow.AddComponent<Billboard>();

            var trailGo = new GameObject("trail");
            trailGo.transform.SetParent(ship.transform, false);
            trailGo.transform.localPosition = new Vector3(side * 1.15f, -0.28f, -1.6f);
            var trail = trailGo.AddComponent<TrailRenderer>();
            trail.time = 0.35f;
            trail.startWidth = 0.4f;
            trail.endWidth = 0.02f;
            trail.material = NVAssets.Additive;
            trail.startColor = new Color(0.35f, 0.9f, 1f, 0.85f);
            trail.endColor = new Color(0.6f, 0.3f, 1f, 0f);
            trail.minVertexDistance = 0.4f;
        }

        var engineLight = new GameObject("engineLight").AddComponent<Light>();
        engineLight.transform.SetParent(ship.transform, false);
        engineLight.transform.localPosition = new Vector3(0f, -0.2f, -1.9f);
        engineLight.type = LightType.Point;
        engineLight.color = new Color(0.4f, 0.9f, 1f);
        engineLight.intensity = 2.4f;
        engineLight.range = 9f;

        var col = ship.AddComponent<BoxCollider>();
        col.center = new Vector3(0f, 0f, 0.2f);
        col.size = new Vector3(6.2f, 1.0f, 5.2f);

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
        weapon.fireInterval = 0.14f;
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

        ship.AddComponent<SkillSystem>();
        ship.AddComponent<ShipController>();
        return ship;
    }
}
