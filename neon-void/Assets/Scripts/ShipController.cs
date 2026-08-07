using UnityEngine;

// Shooter-style controls: mouse-look aims the ship (cursor locked,
// crosshair at screen center), WASD strafes relative to where you look,
// Space/Ctrl for up/down, Shift boost, LMB fire.
public class ShipController : MonoBehaviour
{
    public float moveSpeed = 32f;
    public float boostMultiplier = 1.9f;
    public float accel = 45f;
    public float mouseSens = 2.1f;

    [HideInInspector] public bool boosting;
    [HideInInspector] public float currentSpeed;

    float _yaw, _pitch, _roll;
    Vector3 _vel;
    Rigidbody _rb;
    Weapon _weapon;
    SkillSystem _skills;

    void Awake()
    {
        _rb = GetComponent<Rigidbody>();
        _weapon = GetComponent<Weapon>();
        _skills = GetComponent<SkillSystem>();
        Vector3 e = transform.rotation.eulerAngles;
        _yaw = e.y; _pitch = e.x;
    }

    void Update()
    {
        if (!GameManager.I.Running || GameManager.I.Paused) return;

        _yaw += Input.GetAxis("Mouse X") * mouseSens;
        _pitch = Mathf.Clamp(_pitch - Input.GetAxis("Mouse Y") * mouseSens, -85f, 85f);

        if (Input.GetMouseButton(0) && _weapon != null)
            _weapon.TryFire();
    }

    void FixedUpdate()
    {
        if (!GameManager.I.Running || GameManager.I.Paused)
        {
            _vel = Vector3.Lerp(_vel, Vector3.zero, 0.04f);
            _rb.linearVelocity = _vel;
            return;
        }

        float h = (Input.GetKey(KeyCode.D) ? 1f : 0f) - (Input.GetKey(KeyCode.A) ? 1f : 0f);
        float fwd = (Input.GetKey(KeyCode.W) ? 1f : 0f) - (Input.GetKey(KeyCode.S) ? 1f : 0f);
        float up = (Input.GetKey(KeyCode.Space) ? 1f : 0f) - (Input.GetKey(KeyCode.LeftControl) ? 1f : 0f);
        Vector3 dir = new Vector3(h, up, fwd);
        if (dir.sqrMagnitude > 1f) dir.Normalize();

        boosting = Input.GetKey(KeyCode.LeftShift) && dir.sqrMagnitude > 0.01f;
        float speedMult = _skills != null ? _skills.SpeedMult : 1f;
        Vector3 target = Quaternion.Euler(0f, _yaw, 0f) * Quaternion.AngleAxis(_pitch, Vector3.right) * dir
            * moveSpeed * speedMult * (boosting ? boostMultiplier : 1f);

        _vel = Vector3.MoveTowards(_vel, target, accel * Time.fixedDeltaTime);
        _rb.linearVelocity = _vel;
        currentSpeed = _vel.magnitude;

        // bank into strafes, ease back level
        _roll = Mathf.Lerp(_roll, -h * 14f, Time.fixedDeltaTime * 6f);
        _rb.MoveRotation(Quaternion.Euler(_pitch, _yaw, _roll));
    }

    void OnCollisionEnter(Collision c)
    {
        if (!GameManager.I.Running) return;
        float impact = c.relativeVelocity.magnitude;
        if (impact < 6f) return;
        var h = GetComponent<Health>();
        h.TakeDamage(Mathf.Min(45f, impact * 1.1f));
        ExplosionFactory.Sparks(c.GetContact(0).point, new Color(1f, 0.7f, 0.3f));
        ChaseCamera.Shake(0.6f);
        GameManager.I.PlaySfx(SfxSynth.Hit);
        _vel *= 0.3f;
    }
}
