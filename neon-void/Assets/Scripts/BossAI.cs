using UnityEngine;

// The Void Dreadnought: slowly circles the player at standoff range,
// hammers with lead-corrected turret bursts, and periodically vents a
// radial ring of bolts. Death = victory condition (WaveDirector listens).
public class BossAI : MonoBehaviour
{
    public Transform[] turretMuzzles;
    public float standoff = 150f;
    public float speed = 12f;

    Rigidbody _rb;
    Transform _player;
    Rigidbody _playerRb;
    float _turretTimer = 2f;
    float _ringTimer = 8f;
    int _orbitSign = 1;

    const float BoltSpeed = 80f;
    const float BoltDamage = 14f;
    static readonly Color BoltColor = new Color(1f, 0.2f, 0.3f);

    void Awake()
    {
        _rb = GetComponent<Rigidbody>();
        var h = GetComponent<Health>();
        h.OnDeath += OnDeath;
    }

    void Start()
    {
        var ship = FindAnyObjectByType<ShipController>();
        if (ship != null) { _player = ship.transform; _playerRb = ship.GetComponent<Rigidbody>(); }
        if (Random.value > 0.5f) _orbitSign = -1;
    }

    void OnDeath(Health h)
    {
        for (int i = 0; i < 6; i++)
        {
            Vector3 p = transform.position + Random.insideUnitSphere * 14f;
            ExplosionFactory.Explode(p, new Color(1f, 0.4f, 0.3f), 3f, true);
        }
        GameManager.I.PlaySfxAt(SfxSynth.BigBoom, transform.position, 1f);
        GameManager.I.EnemyKilled(5000, transform.position);
        Powerup.TryDrop(transform.position, 1f);
        Powerup.TryDrop(transform.position + Vector3.right * 6f, 1f);
        Powerup.TryDrop(transform.position + Vector3.up * 6f, 1f);
        Destroy(gameObject);
    }

    void FixedUpdate()
    {
        if (_player == null || !GameManager.I.Running) return;

        Vector3 toPlayer = _player.position - transform.position;
        float dist = toPlayer.magnitude;

        // broadside orbit at standoff range
        Vector3 tangent = Vector3.Cross(toPlayer.normalized, Vector3.up) * _orbitSign;
        Vector3 radial = toPlayer.normalized * Mathf.Clamp((dist - standoff) / 60f, -1f, 1f);
        Vector3 desired = (tangent + radial).normalized;

        Quaternion want = Quaternion.LookRotation(desired);
        _rb.MoveRotation(Quaternion.RotateTowards(_rb.rotation, want, 14f * Time.fixedDeltaTime));
        _rb.linearVelocity = transform.forward * speed * ActiveSkills.EnemySlow;

        // turret bursts with lead
        _turretTimer -= Time.fixedDeltaTime;
        if (_turretTimer <= 0f && dist < 320f)
        {
            _turretTimer = Mathf.Max(0.9f, 2.2f - GameManager.I.score / 20000f);
            Vector3 aim = _player.position;
            if (_playerRb != null)
                aim += _playerRb.linearVelocity * (dist / BoltSpeed) * 0.9f;
            foreach (var m in turretMuzzles)
            {
                Vector3 dir = (aim - m.position).normalized;
                dir = Quaternion.Euler(Random.Range(-2f, 2f), Random.Range(-2f, 2f), 0f) * dir;
                Projectile.Spawn(m.position, dir * BoltSpeed, BoltDamage, BoltColor, gameObject, false);
            }
            GameManager.I.PlaySfxAt(SfxSynth.Laser, transform.position, 0.5f);
        }

        // radial bolt ring, aimed roughly at the player's plane
        _ringTimer -= Time.fixedDeltaTime;
        if (_ringTimer <= 0f && dist < 300f)
        {
            _ringTimer = 9f;
            Quaternion face = Quaternion.LookRotation(toPlayer.normalized);
            for (int i = 0; i < 22; i++)
            {
                float a = i / 22f * Mathf.PI * 2f;
                Vector3 dir = face * (Quaternion.AngleAxis(a * Mathf.Rad2Deg, Vector3.forward) * new Vector3(0.35f, 0f, 1f)).normalized;
                Projectile.Spawn(transform.position + dir * 6f, dir * 55f, 10f, BoltColor, gameObject, false);
            }
            GameManager.I.PlaySfxAt(SfxSynth.Boom, transform.position, 0.7f);
        }
    }
}
