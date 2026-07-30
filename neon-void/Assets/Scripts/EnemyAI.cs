using UnityEngine;

// Drone fighter: pursues the player, strafes in orbit at mid range,
// fires lead-corrected bursts when roughly facing the target.
public class EnemyAI : MonoBehaviour
{
    public float speed = 22f;
    public float turnDegPerSec = 80f;
    public float orbitDistance = 55f;
    public float fireRange = 130f;
    public int scoreValue = 100;

    Rigidbody _rb;
    Weapon _weapon;
    Transform _player;
    Rigidbody _playerRb;
    float _strafeDir;
    float _strafeTimer;
    float _burstTimer;
    int _burstLeft;
    int _burstSize = 3;

    void Awake()
    {
        _rb = GetComponent<Rigidbody>();
        _weapon = GetComponent<Weapon>();
        _strafeDir = Random.value > 0.5f ? 1f : -1f;
        var h = GetComponent<Health>();
        h.OnDeath += OnDeath;
    }

    void OnEnable()
    {
        var bc = GetComponent<BurstConfig>();
        if (bc != null) _burstSize = bc.burstSize;
    }

    void Start()
    {
        var ship = FindAnyObjectByType<ShipController>();
        if (ship != null) { _player = ship.transform; _playerRb = ship.GetComponent<Rigidbody>(); }
    }

    void OnDeath(Health h)
    {
        ExplosionFactory.Explode(transform.position, new Color(1f, 0.4f, 0.85f), 1.4f, true);
        GameManager.I.PlaySfxAt(SfxSynth.Boom, transform.position, 0.9f);
        GameManager.I.EnemyKilled(scoreValue, transform.position);
        Powerup.TryDrop(transform.position, 0.25f);
        Destroy(gameObject);
    }

    void FixedUpdate()
    {
        if (_player == null || !GameManager.I.Running) return;

        Vector3 toPlayer = _player.position - transform.position;
        float dist = toPlayer.magnitude;

        // steer: far -> pursue; near -> orbit strafe; too near -> break away
        Vector3 desired;
        if (dist > orbitDistance * 1.4f) desired = toPlayer;
        else if (dist < orbitDistance * 0.55f) desired = -toPlayer;
        else
        {
            Vector3 tangent = Vector3.Cross(toPlayer.normalized, Vector3.up);
            if (tangent.sqrMagnitude < 0.01f) tangent = Vector3.Cross(toPlayer.normalized, Vector3.right);
            desired = tangent * _strafeDir + toPlayer.normalized * 0.25f;
        }

        _strafeTimer -= Time.fixedDeltaTime;
        if (_strafeTimer <= 0f) { _strafeTimer = Random.Range(2.5f, 5f); _strafeDir = -_strafeDir; }

        Quaternion want = Quaternion.LookRotation(desired.normalized);
        _rb.MoveRotation(Quaternion.RotateTowards(_rb.rotation, want, turnDegPerSec * Time.fixedDeltaTime));
        _rb.linearVelocity = transform.forward * speed;

        // firing: bursts of 3 with lead correction
        _burstTimer -= Time.fixedDeltaTime;
        if (_burstLeft > 0 && _burstTimer <= 0f)
        {
            FireLead();
            _burstLeft--;
            _burstTimer = 0.14f;
        }
        else if (_burstLeft <= 0 && _burstTimer <= 0f && dist < fireRange)
        {
            float facing = Vector3.Angle(transform.forward, toPlayer);
            if (facing < 20f) { _burstLeft = _burstSize; }
            else _burstTimer = 0.3f;
        }
    }

    void FireLead()
    {
        if (_weapon == null || _player == null) return;
        Vector3 targetPos = _player.position;
        if (_playerRb != null)
        {
            float travel = Vector3.Distance(transform.position, targetPos) / _weapon.projectileSpeed;
            targetPos += _playerRb.linearVelocity * travel * 0.85f;
        }
        _weapon.FireToward(targetPos - transform.position);
    }
}
