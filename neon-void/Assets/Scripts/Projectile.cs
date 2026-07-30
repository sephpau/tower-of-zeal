using System.Collections.Generic;
using UnityEngine;

public class Projectile : MonoBehaviour
{
    static readonly Queue<Projectile> Pool = new Queue<Projectile>();

    Vector3 _velocity;
    float _damage, _life;
    GameObject _owner;
    bool _fromPlayer;
    TrailRenderer _trail;
    MeshRenderer _core;

    public static void Spawn(Vector3 pos, Vector3 velocity, float damage, Color color, GameObject owner, bool fromPlayer)
    {
        Projectile p = Pool.Count > 0 ? Pool.Dequeue() : Build();
        p.gameObject.SetActive(true);
        p.transform.position = pos;
        p.transform.rotation = Quaternion.LookRotation(velocity);
        p._velocity = velocity;
        p._damage = damage;
        p._owner = owner;
        p._fromPlayer = fromPlayer;
        p._life = 3f;
        p._core.material.SetColor("_TintColor", color);
        p._trail.startColor = color;
        p._trail.endColor = new Color(color.r, color.g, color.b, 0f);
        p._trail.Clear();
    }

    static Projectile Build()
    {
        var go = new GameObject("bolt");
        var p = go.AddComponent<Projectile>();

        var core = GameObject.CreatePrimitive(PrimitiveType.Quad);
        Object.Destroy(core.GetComponent<Collider>());
        core.transform.SetParent(go.transform, false);
        core.transform.localScale = Vector3.one * 1.1f;
        p._core = core.GetComponent<MeshRenderer>();
        p._core.material = NVAssets.AdditiveTinted(Color.white);
        core.AddComponent<Billboard>();

        p._trail = go.AddComponent<TrailRenderer>();
        p._trail.time = 0.12f;
        p._trail.startWidth = 0.35f;
        p._trail.endWidth = 0.02f;
        p._trail.material = NVAssets.Additive;
        p._trail.minVertexDistance = 0.5f;
        return p;
    }

    void Update()
    {
        _life -= Time.deltaTime;
        if (_life <= 0f) { Release(); return; }

        Vector3 step = _velocity * Time.deltaTime;
        if (Physics.Raycast(transform.position, step.normalized, out RaycastHit hit, step.magnitude + 0.3f))
        {
            if (hit.collider.attachedRigidbody == null || hit.collider.attachedRigidbody.gameObject != _owner)
            {
                var h = hit.collider.GetComponentInParent<Health>();
                if (h != null && h.gameObject != _owner)
                {
                    // no friendly fire between enemies
                    if (_fromPlayer || h.isPlayer)
                    {
                        h.TakeDamage(_damage);
                        ExplosionFactory.Sparks(hit.point, _fromPlayer ? new Color(0.4f, 0.9f, 1f) : new Color(1f, 0.4f, 0.8f));
                        if (h.isPlayer)
                        {
                            GameManager.I.PlaySfx(SfxSynth.Hit, 0.7f);
                            ChaseCamera.Shake(0.35f);
                            GameManager.I.FlashDamage();
                        }
                        Release();
                        return;
                    }
                }
                else if (h == null)
                {
                    ExplosionFactory.Sparks(hit.point, new Color(1f, 0.8f, 0.5f));
                    Release();
                    return;
                }
            }
        }
        transform.position += step;
    }

    void Release()
    {
        gameObject.SetActive(false);
        Pool.Enqueue(this);
    }
}

public class Billboard : MonoBehaviour
{
    void LateUpdate()
    {
        if (Camera.main != null)
            transform.rotation = Camera.main.transform.rotation;
    }
}
