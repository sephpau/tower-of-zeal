using UnityEngine;

// Waves of drones spawn on a shell around the player; clearing a wave
// starts a short intermission, then a bigger one.
public class WaveDirector : MonoBehaviour
{
    public int wave;
    public int hostilesAlive;

    float _intermission;
    bool _spawning;

    public void Begin()
    {
        wave = 0;
        hostilesAlive = 0;
        _intermission = 3f;
    }

    void Update()
    {
        if (!GameManager.I.Running) return;
        if (hostilesAlive > 0 || _spawning) return;

        _intermission -= Time.deltaTime;
        if (_intermission <= 0f) StartWave();
    }

    void StartWave()
    {
        wave++;
        _spawning = true;
        GameManager.I.OnWaveStarted(wave);
        int count = Mathf.Min(3 + wave, 11);
        var player = FindFirstObjectByType<ShipController>();
        Vector3 center = player != null ? player.transform.position : Vector3.zero;

        for (int i = 0; i < count; i++)
        {
            Vector3 dir = Random.onUnitSphere;
            dir.y *= 0.5f;
            Vector3 pos = center + dir.normalized * Random.Range(160f, 240f);
            SpawnDrone(pos, wave);
        }
        hostilesAlive = count;
        _spawning = false;
        _intermission = 4f;
    }

    public void HostileDown()
    {
        hostilesAlive = Mathf.Max(0, hostilesAlive - 1);
        if (hostilesAlive == 0)
            GameManager.I.OnWaveCleared(wave);
    }

    void SpawnDrone(Vector3 pos, int waveNum)
    {
        var go = new GameObject("drone");
        go.transform.position = pos;

        // body: squashed sphere core + 4 blade fins + glowing eye
        var core = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        Object.Destroy(core.GetComponent<Collider>());
        core.transform.SetParent(go.transform, false);
        core.transform.localScale = new Vector3(1.6f, 0.9f, 2.2f);
        core.GetComponent<MeshRenderer>().sharedMaterial = NVAssets.Standard(new Color(0.22f, 0.1f, 0.3f), 0.6f, 0.35f);

        for (int i = 0; i < 4; i++)
        {
            var fin = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Object.Destroy(fin.GetComponent<Collider>());
            fin.transform.SetParent(go.transform, false);
            float ang = 45f + i * 90f;
            fin.transform.localRotation = Quaternion.Euler(0f, 0f, ang);
            fin.transform.localPosition = Quaternion.Euler(0f, 0f, ang) * new Vector3(1.3f, 0f, 0f);
            fin.transform.localScale = new Vector3(1.4f, 0.08f, 0.7f);
            fin.GetComponent<MeshRenderer>().sharedMaterial = NVAssets.PinkEmissive;
        }

        var eye = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        Object.Destroy(eye.GetComponent<Collider>());
        eye.transform.SetParent(go.transform, false);
        eye.transform.localPosition = new Vector3(0f, 0f, 1.0f);
        eye.transform.localScale = Vector3.one * 0.55f;
        eye.GetComponent<MeshRenderer>().sharedMaterial = NVAssets.PinkEmissive;

        var col = go.AddComponent<SphereCollider>();
        col.radius = 1.6f;
        var rb = go.AddComponent<Rigidbody>();
        rb.useGravity = false;
        rb.linearDamping = 0f;
        rb.angularDamping = 2f;

        var h = go.AddComponent<Health>();
        h.Configure(0f, 26f + waveNum * 4f);
        h.OnDeath += _ => HostileDown();

        var w = go.AddComponent<Weapon>();
        w.isPlayerWeapon = false;
        w.fireInterval = 0.14f;
        w.projectileSpeed = 70f;
        w.damage = Mathf.Min(16f, 8f + waveNum);
        w.boltColor = new Color(1f, 0.35f, 0.8f);
        var muzzle = new GameObject("muzzle").transform;
        muzzle.SetParent(go.transform, false);
        muzzle.localPosition = new Vector3(0f, 0f, 2.4f);
        w.muzzles = new[] { muzzle };

        var ai = go.AddComponent<EnemyAI>();
        ai.speed = Mathf.Min(30f, 20f + waveNum * 1.2f);
        ai.scoreValue = 100 + waveNum * 10;
    }
}
