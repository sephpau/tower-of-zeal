using System.Collections.Generic;
using UnityEngine;

// Infinite asteroid belt: a constant-density cloud that follows the player.
// Rocks drifting out of range are recycled to a fresh spot nearby, and
// destroyed rocks respawn, so there is no edge and no depletion.
public class AsteroidField : MonoBehaviour
{
    public int count = 220;
    public float innerRadius = 60f;
    public float outerRadius = 420f;
    public float recycleDistance = 520f;   // farther than this from the player -> recycled

    readonly List<GameObject> _rocks = new List<GameObject>();
    Mesh[] _meshes;
    Transform _player;
    float _scanTimer;

    public void Build()
    {
        _meshes = new Mesh[6];
        for (int i = 0; i < _meshes.Length; i++) _meshes[i] = NVAssets.RockMesh(i * 7919 + 13);

        for (int i = 0; i < count; i++)
            SpawnRock(RandomPosAround(Vector3.zero, innerRadius, outerRadius));
    }

    static Vector3 RandomPosAround(Vector3 center, float rIn, float rOut)
    {
        float r = Mathf.Lerp(rIn, rOut, Mathf.Pow(Random.value, 0.6f));
        Vector3 p = Random.onUnitSphere * r;
        p.y *= 0.45f;   // thick disc, belt-like
        return center + p;
    }

    void SpawnRock(Vector3 pos)
    {
        float size = Random.value < 0.12f ? Random.Range(6f, 13f) : Random.Range(1.5f, 5f);
        var go = new GameObject("asteroid");
        go.transform.position = pos;
        go.transform.rotation = Random.rotation;
        go.transform.localScale = Vector3.one * size;

        var mf = go.AddComponent<MeshFilter>();
        mf.sharedMesh = _meshes[Random.Range(0, _meshes.Length)];
        var mr = go.AddComponent<MeshRenderer>();
        mr.sharedMaterial = NVAssets.Rock;

        var col = go.AddComponent<SphereCollider>();
        col.radius = 0.85f;

        var rb = go.AddComponent<Rigidbody>();
        rb.useGravity = false;
        rb.mass = size * 4f;
        rb.linearDamping = 0f;
        rb.angularDamping = 0.05f;

        var h = go.AddComponent<Health>();
        h.Configure(0f, size * 9f);
        var a = go.AddComponent<Asteroid>();
        a.size = size;

        _rocks.Add(go);
    }

    void Update()
    {
        if (_player == null)
        {
            var ship = FindAnyObjectByType<ShipController>();
            if (ship != null) _player = ship.transform;
            return;
        }

        _scanTimer -= Time.deltaTime;
        if (_scanTimer > 0f) return;
        _scanTimer = 0.5f;

        Vector3 c = _player.position;

        // drop destroyed rocks from tracking
        for (int i = _rocks.Count - 1; i >= 0; i--)
            if (_rocks[i] == null) _rocks.RemoveAt(i);

        // recycle rocks the player left behind to fresh spots nearby
        foreach (var rock in _rocks)
        {
            if ((rock.transform.position - c).sqrMagnitude < recycleDistance * recycleDistance)
                continue;
            rock.transform.position = RandomPosAround(c, 260f, recycleDistance - 60f);
            rock.transform.rotation = Random.rotation;
            var rb = rock.GetComponent<Rigidbody>();
            rb.linearVelocity = Vector3.zero;
            rb.angularVelocity = Random.insideUnitSphere * 0.4f;
            var h = rock.GetComponent<Health>();
            h.hull = h.maxHull;
        }

        // shot rocks respawn out of sight — the belt never thins out
        while (_rocks.Count < count)
            SpawnRock(RandomPosAround(c, 260f, outerRadius));
    }
}
