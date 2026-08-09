using UnityEngine;

// Boss ordnance: a homing missile the player can NULLIFY — it has its own
// small health pool, so shooting it down detonates it harmlessly (and pays
// a little score + xp). Reaching its target hurts.
public class EnemyMissile : MonoBehaviour
{
    public const float Damage = 32f;
    const float Speed = 46f;
    const float TurnDegPerSec = 105f;
    const float FuseRadius = 4.5f;

    Transform _target;
    float _life = 10f;
    bool _done;

    public static GameObject Launch(Vector3 pos, Vector3 initialDir, Color tint)
    {
        var go = new GameObject("missile");
        go.transform.position = pos;
        go.transform.rotation = Quaternion.LookRotation(initialDir.sqrMagnitude > 0.001f ? initialDir : Vector3.forward);

        var warheadMat = NVAssets.Emissive(tint, 2.6f);
        NVMeshes.SpherePart(go, warheadMat, Vector3.zero, new Vector3(0.55f, 0.55f, 1.8f));
        NVMeshes.SpherePart(go, NVAssets.Emissive(new Color(1f, 0.8f, 0.3f), 3f), new Vector3(0f, 0f, 0.9f), Vector3.one * 0.4f);
        var glow = NVAssets.Quad(NVAssets.AdditiveTinted(tint), 2.4f);
        glow.transform.SetParent(go.transform, false);
        glow.transform.localPosition = new Vector3(0f, 0f, -1.1f);
        glow.AddComponent<Billboard>();
        var trail = go.AddComponent<TrailRenderer>();
        trail.time = 0.45f;
        trail.startWidth = 0.5f;
        trail.endWidth = 0.03f;
        trail.material = NVAssets.Additive;
        trail.startColor = tint;
        trail.endColor = new Color(tint.r, tint.g, tint.b, 0f);
        trail.minVertexDistance = 0.4f;

        var col = go.AddComponent<SphereCollider>();
        col.radius = 1.2f;
        var h = go.AddComponent<Health>();
        h.Configure(0f, 30f);
        var m = go.AddComponent<EnemyMissile>();
        h.OnDeath += _ => {                       // shot down: harmless boom + a small bounty
            GameManager.I.EnemyKilled(40, m.transform.position);
            m.Detonate(false);
        };
        NVOutline.Add(go, NVOutline.Hostile, 0.06f);
        GameManager.I.PlaySfxAt(SfxSynth.Laser, pos, 0.55f);
        return go;
    }

    void Start() => AcquireTarget();

    void AcquireTarget()
    {
        var ship = FindAnyObjectByType<ShipController>();
        Transform t = ship != null && ship.gameObject.activeInHierarchy ? ship.transform : null;
        var remote = CoopSync.RemoteShip;
        if (remote != null && (t == null ||
            (remote.position - transform.position).sqrMagnitude < (t.position - transform.position).sqrMagnitude))
            t = remote;
        _target = t;
    }

    void Update()
    {
        if (GameManager.I == null || !GameManager.I.Running) { Destroy(gameObject); return; }
        _life -= Time.deltaTime;
        if (_life <= 0f) { Detonate(false); return; }
        if (_target == null || !_target.gameObject.activeInHierarchy)
        {
            AcquireTarget();
            if (_target == null) return;
        }
        Vector3 to = _target.position - transform.position;
        transform.rotation = Quaternion.RotateTowards(transform.rotation,
            Quaternion.LookRotation(to.normalized), TurnDegPerSec * Time.deltaTime);
        transform.position += transform.forward * Speed * ActiveSkills.EnemySlow * Time.deltaTime;
        if (to.magnitude < FuseRadius) Detonate(true);
    }

    void Detonate(bool reached)
    {
        if (_done) return;
        _done = true;
        ExplosionFactory.Explode(transform.position, new Color(1f, 0.5f, 0.2f), 1.7f, true);
        GameManager.I.PlaySfxAt(SfxSynth.Boom, transform.position, 0.85f);
        if (reached && _target != null)
        {
            var h = _target.GetComponent<Health>();
            if (h != null && h.isPlayer)
            {
                h.TakeDamage(Damage);
                GameManager.I.FlashDamage();
                ChaseCamera.Shake(0.5f);
            }
        }
        Destroy(gameObject);
    }
}

// Homing missile: steers toward its target, dies after 6s, hits hard.
public class Missile : MonoBehaviour
{
    Vector3 _velocity;
    Transform _target;
    GameObject _owner;
    float _life;
    float _damage = 30f;

    const float Speed = 62f;
    const float TurnDegPerSec = 160f;
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

    public static void Launch(Vector3 pos, Vector3 initialDir, Transform target, GameObject owner, float damage = 30f)
    {
        var go = new GameObject("missile");
        go.transform.position = pos;
        var m = go.AddComponent<Missile>();
        m._velocity = initialDir.normalized * Speed * 0.5f;
        m._target = target;
        m._owner = owner;
        m._damage = damage;
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

        // deck-cannon rounds are ordnance too: shootable before they land
        var col = go.AddComponent<SphereCollider>();
        col.radius = 0.9f;
        var hp = go.AddComponent<Health>();
        hp.Configure(0f, 20f);
        hp.playerSide = true;
        hp.OnDeath += _ => {
            ExplosionFactory.Explode(go.transform.position, Tint, 0.8f);
            GameManager.I.PlaySfxAt(SfxSynth.Boom, go.transform.position, 0.5f);
            Destroy(go);
        };
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
            if (hit.collider.GetComponentInParent<Missile>() != this &&
                (hit.collider.attachedRigidbody == null || hit.collider.attachedRigidbody.gameObject != _owner))
            {
                Detonate(hit.point, hit.collider.GetComponentInParent<Health>());
                return;
            }
        }
        transform.position += step;
    }

    void Detonate(Vector3 at, Health direct)
    {
        if (direct != null && !direct.isPlayer && !direct.playerSide) direct.TakeDamage(_damage);
        ExplosionFactory.Explode(at, Tint, 0.8f);
        GameManager.I.PlaySfxAt(SfxSynth.Boom, at, 0.5f);
        Destroy(gameObject);
    }
}
