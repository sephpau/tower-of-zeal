using UnityEngine;

// Ego's pod-fighter: a wide saucer hull with a glowing rim, a big
// transparent glass dome with Ego visibly piloting inside, swept neon
// wings, V-fins and twin engine nacelles. Chunky ship for a chunky pilot.
public static class PlayerShipFactory
{
    public static GameObject Build(Vector3 pos)
    {
        var ship = new GameObject("PlayerShip");
        ship.transform.position = pos;

        var hullMat = NVAssets.Standard(new Color(0.30f, 0.32f, 0.46f), 0.85f, 0.25f);
        var darkMat = NVAssets.Standard(new Color(0.12f, 0.12f, 0.2f), 0.7f, 0.3f);
        var cyan = NVAssets.CyanEmissive;
        var pink = NVAssets.PinkEmissive;

        // see-through glass so Ego is visible inside
        var glassMat = NVAssets.StandardFade(new Color(0.45f, 0.8f, 1f, 0.1f), 0.9f, 0.03f);

        // ---- saucer hull (lathe around Z, tipped flat) ----
        Vector2[] saucer = {
            new Vector2(0.95f,  0.32f),   // dome rim
            new Vector2(1.55f,  0.14f),
            new Vector2(1.85f,  0.00f),   // outer edge
            new Vector2(1.55f, -0.26f),
            new Vector2(0.7f,  -0.42f),
            new Vector2(0.001f,-0.46f),   // belly center
        };
        NVMeshes.Part(ship, NVMeshes.Lathe(saucer, 36), hullMat, Vector3.zero, new Vector3(-90f, 0f, 0f), Vector3.one);

        // glowing rim ring around the saucer edge (the mockup's halo)
        var rim = new GameObject("rim");
        rim.transform.SetParent(ship.transform, false);
        rim.transform.localPosition = new Vector3(0f, 0.02f, 0f);
        rim.AddComponent<MeshFilter>().sharedMesh = NVAssets.RingMesh(1.78f, 1.95f, 48);
        rim.AddComponent<MeshRenderer>().sharedMaterial = cyan;

        // nose wedge so the saucer reads "forward"
        NVMeshes.SpherePart(ship, darkMat, new Vector3(0f, -0.05f, 1.7f), new Vector3(0.75f, 0.28f, 1.15f));
        var noseStripe = GameObject.CreatePrimitive(PrimitiveType.Cube);
        Object.Destroy(noseStripe.GetComponent<Collider>());
        noseStripe.transform.SetParent(ship.transform, false);
        noseStripe.transform.localPosition = new Vector3(0f, 0.06f, 2.05f);
        noseStripe.transform.localScale = new Vector3(0.12f, 0.06f, 0.9f);
        noseStripe.GetComponent<MeshRenderer>().sharedMaterial = pink;

        // ---- Ego under the dome, then the glass over him ----
        EgoModel.Spawn(ship.transform, new Vector3(0f, 0.05f, 0f), 0.85f);
        var dome = NVMeshes.SpherePart(ship, glassMat, new Vector3(0f, 0.3f, 0f), new Vector3(1.9f, 1.5f, 1.9f));
        dome.name = "canopyDome";

        var wingMesh = NVMeshes.Wing(3.1f, 2.0f, 0.65f, 1.7f, 0.15f);
        var finMesh = NVMeshes.Wing(1.0f, 0.85f, 0.32f, 0.5f, 0.1f);

        foreach (float side in new[] { -1f, 1f })
        {
            // swept wings off the saucer sides
            NVMeshes.Part(ship, wingMesh, hullMat,
                new Vector3(side * 1.35f, -0.05f, -0.1f),
                new Vector3(0f, 0f, side > 0 ? -4f : 184f), Vector3.one);
            var stripe = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Object.Destroy(stripe.GetComponent<Collider>());
            stripe.transform.SetParent(ship.transform, false);
            stripe.transform.localPosition = new Vector3(side * 2.9f, -0.14f, 0.42f);
            stripe.transform.localRotation = Quaternion.Euler(0f, side * 29f, 0f);
            stripe.transform.localScale = new Vector3(3.1f, 0.05f, 0.08f);
            stripe.GetComponent<MeshRenderer>().sharedMaterial = cyan;

            // V-fins at the back
            NVMeshes.Part(ship, finMesh, darkMat,
                new Vector3(side * 0.9f, 0.12f, -1.45f),
                new Vector3(0f, 0f, side > 0 ? 66f : 114f), Vector3.one);
            var finEdge = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Object.Destroy(finEdge.GetComponent<Collider>());
            finEdge.transform.SetParent(ship.transform, false);
            finEdge.transform.localPosition = new Vector3(side * 1.28f, 0.62f, -1.68f);
            finEdge.transform.localRotation = Quaternion.Euler(0f, 0f, side * 24f);
            finEdge.transform.localScale = new Vector3(0.06f, 0.85f, 0.09f);
            finEdge.GetComponent<MeshRenderer>().sharedMaterial = pink;

            // engine nacelles under the wings
            Vector2[] nacelle = {
                new Vector2(0.001f, 0.85f),
                new Vector2(0.17f,  0.65f),
                new Vector2(0.24f,  0.05f),
                new Vector2(0.21f, -0.5f),
                new Vector2(0.15f, -0.7f),
                new Vector2(0.001f,-0.7f),
            };
            NVMeshes.Part(ship, NVMeshes.Lathe(nacelle, 16), darkMat,
                new Vector3(side * 1.7f, -0.28f, -0.9f), Vector3.zero, Vector3.one);

            var glow = NVAssets.Quad(NVAssets.AdditiveTinted(new Color(0.4f, 0.95f, 1f)), 1.3f);
            glow.transform.SetParent(ship.transform, false);
            glow.transform.localPosition = new Vector3(side * 1.7f, -0.28f, -1.75f);
            glow.AddComponent<Billboard>();

            var trailGo = new GameObject("trail");
            trailGo.transform.SetParent(ship.transform, false);
            trailGo.transform.localPosition = new Vector3(side * 1.7f, -0.28f, -1.8f);
            var trail = trailGo.AddComponent<TrailRenderer>();
            trail.time = 0.35f;
            trail.startWidth = 0.45f;
            trail.endWidth = 0.02f;
            trail.material = NVAssets.Additive;
            trail.startColor = new Color(0.35f, 0.9f, 1f, 0.85f);
            trail.endColor = new Color(0.6f, 0.3f, 1f, 0f);
            trail.minVertexDistance = 0.4f;
        }

        // guard bubble — toggled by ShipController while SHIFT is held
        var guardBubble = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        Object.Destroy(guardBubble.GetComponent<Collider>());
        guardBubble.name = "guardBubble";
        guardBubble.transform.SetParent(ship.transform, false);
        guardBubble.transform.localScale = Vector3.one * 5.2f;
        var guardMat = new Material(Shader.Find("Legacy Shaders/Particles/Additive"));
        guardMat.mainTexture = NVAssets.GlowTex;
        guardMat.SetColor("_TintColor", new Color(0.3f, 0.7f, 1f, 0.35f));
        guardBubble.GetComponent<MeshRenderer>().sharedMaterial = guardMat;
        guardBubble.SetActive(false);

        var engineLight = new GameObject("engineLight").AddComponent<Light>();
        engineLight.transform.SetParent(ship.transform, false);
        engineLight.transform.localPosition = new Vector3(0f, -0.2f, -1.8f);
        engineLight.type = LightType.Point;
        engineLight.color = new Color(0.4f, 0.9f, 1f);
        engineLight.intensity = 2.4f;
        engineLight.range = 9f;

        // soft light inside the dome so Ego reads through the glass
        var domeLight = new GameObject("domeLight").AddComponent<Light>();
        domeLight.transform.SetParent(ship.transform, false);
        domeLight.transform.localPosition = new Vector3(0f, 1.1f, 0.4f);
        domeLight.type = LightType.Point;
        domeLight.color = new Color(1f, 0.9f, 0.8f);
        domeLight.intensity = 0.8f;
        domeLight.range = 2.8f;

        var col = ship.AddComponent<BoxCollider>();
        col.center = new Vector3(0f, 0.1f, 0f);
        col.size = new Vector3(7.5f, 1.6f, 4.4f);

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
            m.localPosition = new Vector3(i == 0 ? -2.6f : 2.6f, -0.1f, 0.9f);
            muzzles[i] = m;
        }
        weapon.muzzles = muzzles;

        ship.AddComponent<SkillSystem>();
        ship.AddComponent<ShipController>();
        return ship;
    }
}
