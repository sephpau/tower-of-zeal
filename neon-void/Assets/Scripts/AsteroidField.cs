using UnityEngine;

// Scatters craggy shootable rocks in a big shell around the arena origin.
public class AsteroidField : MonoBehaviour
{
    public int count = 220;
    public float innerRadius = 60f;
    public float outerRadius = 420f;

    public void Build()
    {
        var meshes = new Mesh[6];
        for (int i = 0; i < meshes.Length; i++) meshes[i] = NVAssets.RockMesh(i * 7919 + 13);

        for (int i = 0; i < count; i++)
        {
            float r = Mathf.Lerp(innerRadius, outerRadius, Mathf.Pow(Random.value, 0.6f));
            Vector3 pos = Random.onUnitSphere * r;
            pos.y *= 0.45f;   // flatten the field into a thick disc, belt-like

            float size = Random.value < 0.12f ? Random.Range(6f, 13f) : Random.Range(1.5f, 5f);
            var go = new GameObject("asteroid");
            go.transform.position = pos;
            go.transform.rotation = Random.rotation;
            go.transform.localScale = Vector3.one * size;

            var mf = go.AddComponent<MeshFilter>();
            mf.sharedMesh = meshes[i % meshes.Length];
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
        }
    }
}
