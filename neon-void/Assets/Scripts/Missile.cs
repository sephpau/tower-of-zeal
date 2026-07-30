using UnityEngine;

// Homing missile: steers toward its target, dies after 6s, hits hard.
public class Missile : MonoBehaviour
{
    Vector3 _velocity;
    Transform _target;
    GameObject _owner;
    float _life;

    const float Speed = 62f;
    const float TurnDegPerSec = 160f;
    const float Damage = 30f;
    static readonly Color Tint = new Color(1f, 0.55f, 0.9f);

    public static Transform FindTarget(Vector3 from, float range)
    {
        Transform best = null;
        float bestScore = float.MaxValue;
        foreach (var h in SkillSystem.AllHostiles())
        {
            float d = Vector3.Distance(from, h.transform.position);
            if (d < range && d < bestScore) { bestScore = d; best = h.transform; }
        }
        var boss = Object.FindAnyObjectByType<BossAI>();
        if (boss != null && Vector3.Distance(from, boss.transform.position) < range * 1.4f)
            best = boss.transform;   // the dreadnought is always preferred when in reach
        return best;
    }

    public static void Launch(Vector3 pos, Vector3 initialDir, Transform target, GameObject owner)
    {
        var go = new GameObject("missile");
        go.transform.position = pos;
        var m = go.AddComponent<Missile>();
        m._velocity = initialDir.normalized * Speed * 0.5f;
        m._target = target;
        m._owner = owner;
        m._life = 6f;

        Vector2[] bodyProfile = {
            new Vector2(0.001f, 0.55f),
            new Vector2(0.09f,  0.3f),
            new Vector2(0.09f, -0.4f),
            new Vector2(0.001f,-0.4f),
        };
        NVMeshes.Part(go, NVMeshes.Lathe(bodyProfile, 10), NVAssets.Emissive(Tint, 2f), Vector3.zero, Vector3.zero, Vector3.one);

        var trail = go.AddComponent<TrailRenderer>();
        trail.time = 0.35f;
        trail.startWidth = 0.25f;
        trail.endWidth = 0.02f;
        trail.material = NVAssets.Additive;
        trail.startColor = Tint;
        trail.endColor = new Color(Tint.r, Tint.g, Tint.b, 0f);
        trail.minVertexDistance = 0.4f;
    }

    void Update()
    {
        _life -= Time.deltaTime;
        if (_life <= 0f) { Detonate(transform.position, null); return; }

        // accelerate + steer
        float speed = Mathf.Min(Speed, _velocity.magnitude + 70f * Time.deltaTime);
        Vector3 dir = _velocity.normalized;
        if (_target != null)
        {
            Vector3 want = (_target.position - transform.position).normalized;
            dir = Vector3.RotateTowards(dir, want, TurnDegPerSec * Mathf.Deg2Rad * Time.deltaTime, 0f);
        }
        _velocity = dir * speed;
        transform.rotation = Quaternion.LookRotation(dir);

        Vector3 step = _velocity * Time.deltaTime;
        if (Physics.Raycast(transform.position, step.normalized, out RaycastHit hit, step.magnitude + 0.3f))
        {
            if (hit.collider.attachedRigidbody == null || hit.collider.attachedRigidbody.gameObject != _owner)
            {
                Detonate(hit.point, hit.collider.GetComponentInParent<Health>());
                return;
            }
        }
        transform.position += step;
    }

    void Detonate(Vector3 at, Health direct)
    {
        if (direct != null && !direct.isPlayer) direct.TakeDamage(Damage);
        ExplosionFactory.Explode(at, Tint, 0.8f);
        GameManager.I.PlaySfxAt(SfxSynth.Boom, at, 0.5f);
        Destroy(gameObject);
    }
}
