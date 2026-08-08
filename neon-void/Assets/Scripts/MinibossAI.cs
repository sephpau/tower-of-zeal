using UnityEngine;

// The three Zeal bosses, each with a signature behavior:
//  Shadow Smuggler — cloaks and blinks around the player, ambush bursts,
//                    showers loot on death.
//  Gruyere the Ringmaster — orbits like a carnival wheel, fires radial
//                    "ring" volleys, summons interceptor escorts.
//  Garrison, Void Warden — slow void hulk, drags the player in with a
//                    gravity well, heavy aimed bolts + void novas.
public class MinibossAI : MonoBehaviour
{
    public ZealData.BossDef def;

    Rigidbody _rb;
    Transform _player;
    Rigidbody _playerRb;
    float _actTimer = 3f, _fireTimer = 1.5f, _missileTimer = 6f;
    Renderer[] _renderers;
    float _cloak;   // smuggler: 0 visible .. 1 cloaked

    const float BoltSpeed = 75f;

    public void Configure(ZealData.BossDef d)
    {
        def = d;
        var h = GetComponent<Health>();
        h.OnDeath += OnDeath;
    }

    void Start()
    {
        _rb = GetComponent<Rigidbody>();
        _renderers = GetComponentsInChildren<Renderer>();
        var ship = FindAnyObjectByType<ShipController>();
        if (ship != null) { _player = ship.transform; _playerRb = ship.GetComponent<Rigidbody>(); }
    }

    void OnDeath(Health h)
    {
        ExplosionFactory.Explode(transform.position, def.tint, 2.2f, true);
        GameManager.I.PlaySfxAt(SfxSynth.BigBoom, transform.position, 1f);
        GameManager.I.EnemyKilled(def.score, transform.position);
        XpOrb.Drop(transform.position, def.xp);
        int drops = def.id == "smuggler" ? 4 : 2;   // the Smuggler's hoard
        for (int i = 0; i < drops; i++)
            Powerup.TryDrop(transform.position + Random.insideUnitSphere * 5f, 1f);
        GameManager.I.BossDown();
        Destroy(gameObject);
    }

    void FixedUpdate()
    {
        if (_player == null || !GameManager.I.Running) return;
        Vector3 toPlayer = _player.position - transform.position;
        float dist = toPlayer.magnitude;

        switch (def.behavior)
        {
            case "blink": TickSmuggler(toPlayer, dist); break;
            case "summon": TickGruyere(toPlayer, dist); break;
            default: TickGarrison(toPlayer, dist); break;
        }

        // shared mechanic: homing missile volley — shoot them down before they land
        _missileTimer -= Time.fixedDeltaTime;
        if (_missileTimer <= 0f && dist < 260f)
        {
            _missileTimer = 9f;
            int volley = 1 + def.wave / 3;   // smuggler 2, gruyere 3, garrison 4
            for (int i = 0; i < volley; i++)
            {
                Vector3 dir = (toPlayer.normalized + Random.insideUnitSphere * 0.5f).normalized;
                EnemyMissile.Launch(transform.position + dir * 8f, dir, def.tint);
            }
            GameManager.I.PlaySfxAt(SfxSynth.WaveUp, transform.position, 0.5f);
        }
    }

    // ---------- Shadow Smuggler ----------
    void TickSmuggler(Vector3 toPlayer, float dist)
    {
        // drift toward the player between blinks
        Quaternion want = Quaternion.LookRotation(toPlayer.normalized);
        _rb.MoveRotation(Quaternion.RotateTowards(_rb.rotation, want, 120f * Time.fixedDeltaTime));
        _rb.linearVelocity = transform.forward * 26f * ActiveSkills.EnemySlow;

        _actTimer -= Time.fixedDeltaTime;
        if (_actTimer <= 0f)
        {
            _actTimer = 3.2f;
            // cloak-blink: vanish, reappear at a new angle near the player
            ExplosionFactory.Sparks(transform.position, def.tint);
            Vector3 dir = Random.onUnitSphere; dir.y *= 0.4f;
            transform.position = _player.position + dir.normalized * Random.Range(45f, 70f);
            ExplosionFactory.Sparks(transform.position, def.tint);
            GameManager.I.PlaySfxAt(SfxSynth.Hit, transform.position, 0.5f);
            // ambush burst right after the blink
            for (int i = 0; i < 5; i++)
                FireAimed(6f * i / 5f - 3f);
        }
        SetCloak(Mathf.PingPong(Time.time * 0.7f, 1f) * 0.75f);
    }

    void SetCloak(float k)
    {
        _cloak = k;
        foreach (var r in _renderers)
        {
            var mat = r.material;
            if (mat.HasProperty("_Color"))
            {
                var c = mat.color; c.a = 1f - _cloak * 0.85f;
                mat.color = c;
            }
        }
    }

    // ---------- Gruyere the Ringmaster ----------
    void TickGruyere(Vector3 toPlayer, float dist)
    {
        Vector3 tangent = Vector3.Cross(toPlayer.normalized, Vector3.up);
        Vector3 desired = (tangent + toPlayer.normalized * Mathf.Clamp((dist - 70f) / 40f, -1f, 1f)).normalized;
        Quaternion want = Quaternion.LookRotation(desired);
        _rb.MoveRotation(Quaternion.RotateTowards(_rb.rotation, want, 60f * Time.fixedDeltaTime));
        _rb.linearVelocity = transform.forward * 18f * ActiveSkills.EnemySlow;
        transform.Rotate(0f, 0f, 80f * Time.fixedDeltaTime, Space.Self);   // the wheel spins

        _fireTimer -= Time.fixedDeltaTime;
        if (_fireTimer <= 0f && dist < 220f)
        {
            _fireTimer = 2.6f;
            // radial ring volley — step right up
            Quaternion face = Quaternion.LookRotation(toPlayer.normalized);
            for (int i = 0; i < 16; i++)
            {
                float a = i / 16f * Mathf.PI * 2f;
                Vector3 dir = face * (Quaternion.AngleAxis(a * Mathf.Rad2Deg, Vector3.forward) * new Vector3(0.4f, 0f, 1f)).normalized;
                Projectile.Spawn(transform.position + dir * 5f, dir * 55f, def.dmg * 0.7f, def.tint, gameObject, false);
            }
            GameManager.I.PlaySfxAt(SfxSynth.Boom, transform.position, 0.6f);
        }

        _actTimer -= Time.fixedDeltaTime;
        if (_actTimer <= 0f)
        {
            _actTimer = 9f;
            // summon the circus
            for (int i = 0; i < 2; i++)
            {
                Vector3 pos = transform.position + Random.onUnitSphere * 25f;
                var minion = EnemyFactory.BuildInterceptor(pos, GameManager.I.CurrentWave());
                GameManager.I.RegisterSummon(minion);
            }
            GameManager.I.PlaySfxAt(SfxSynth.WaveUp, transform.position, 0.6f);
        }
    }

    // ---------- Garrison, Void Warden ----------
    void TickGarrison(Vector3 toPlayer, float dist)
    {
        Quaternion want = Quaternion.LookRotation(toPlayer.normalized);
        _rb.MoveRotation(Quaternion.RotateTowards(_rb.rotation, want, 25f * Time.fixedDeltaTime));
        _rb.linearVelocity = transform.forward * 10f * ActiveSkills.EnemySlow;

        // gravity well: drag the player toward the void
        if (dist < 130f && _playerRb != null)
        {
            float pull = Mathf.Lerp(14f, 3f, dist / 130f);
            _playerRb.AddForce(-toPlayer.normalized * pull, ForceMode.Acceleration);
        }

        _fireTimer -= Time.fixedDeltaTime;
        if (_fireTimer <= 0f && dist < 250f)
        {
            _fireTimer = 1.6f;
            FireAimed(0f, 1.4f);
        }

        _actTimer -= Time.fixedDeltaTime;
        if (_actTimer <= 0f && dist < 200f)
        {
            _actTimer = 7f;
            // void nova — expanding shell of bolts
            for (int i = 0; i < 26; i++)
            {
                Vector3 dir = Random.onUnitSphere;
                Projectile.Spawn(transform.position + dir * 6f, dir * 40f, def.dmg * 0.6f, def.tint, gameObject, false);
            }
            ExplosionFactory.Explode(transform.position, def.tint, 2f);
            GameManager.I.PlaySfxAt(SfxSynth.BigBoom, transform.position, 0.7f);
        }
    }

    void FireAimed(float spreadDeg, float dmgMult = 1f)
    {
        if (_player == null) return;
        Vector3 aim = _player.position;
        if (_playerRb != null)
            aim += _playerRb.linearVelocity * (Vector3.Distance(transform.position, aim) / BoltSpeed) * 0.85f;
        Vector3 dir = (aim - transform.position).normalized;
        dir = Quaternion.Euler(Random.Range(-spreadDeg, spreadDeg), Random.Range(-spreadDeg, spreadDeg), 0f) * dir;
        Projectile.Spawn(transform.position + dir * 5f, dir * BoltSpeed, def.dmg * dmgMult, def.tint, gameObject, false);
        GameManager.I.PlaySfxAt(SfxSynth.Laser, transform.position, 0.4f);
    }
}
