using UnityEngine;

// Mouse-aim arcade flight: the ship pitches/yaws toward the cursor's offset
// from screen center. W/S throttle, Shift boost, Q/E roll, LMB/Space fire.
public class ShipController : MonoBehaviour
{
    public float maxSpeed = 34f;
    public float boostMultiplier = 1.9f;
    public float accel = 22f;
    public float turnRate = 95f;    // deg/sec at full cursor deflection
    public float rollRate = 110f;

    [HideInInspector] public float throttle = 0.65f;   // 0..1
    [HideInInspector] public bool boosting;
    [HideInInspector] public float currentSpeed;

    Rigidbody _rb;
    Weapon _weapon;

    void Awake()
    {
        _rb = GetComponent<Rigidbody>();
        _weapon = GetComponent<Weapon>();
    }

    void Update()
    {
        if (!GameManager.I.Running) return;

        throttle = Mathf.Clamp01(throttle + Input.GetAxisRaw("Vertical") * Time.deltaTime * 0.8f);
        boosting = Input.GetKey(KeyCode.LeftShift) && throttle > 0.3f;

        if ((Input.GetMouseButton(0) || Input.GetKey(KeyCode.Space)) && _weapon != null)
            _weapon.TryFire();
    }

    void FixedUpdate()
    {
        if (!GameManager.I.Running) { _rb.linearVelocity = Vector3.Lerp(_rb.linearVelocity, Vector3.zero, 0.02f); return; }

        // cursor offset from screen center drives pitch/yaw
        Vector2 offset = new Vector2(
            (Input.mousePosition.x / Screen.width - 0.5f) * 2f,
            (Input.mousePosition.y / Screen.height - 0.5f) * 2f);
        offset = Vector2.ClampMagnitude(offset * 1.35f, 1f);
        // small deadzone so the ship settles
        if (offset.magnitude < 0.06f) offset = Vector2.zero;

        float pitch = -offset.y * turnRate * Time.fixedDeltaTime;
        float yaw = offset.x * turnRate * Time.fixedDeltaTime;
        float roll = 0f;
        if (Input.GetKey(KeyCode.Q)) roll += rollRate * Time.fixedDeltaTime;
        if (Input.GetKey(KeyCode.E)) roll -= rollRate * Time.fixedDeltaTime;
        // auto-bank into turns for feel
        roll += -offset.x * 24f * Time.fixedDeltaTime;

        _rb.MoveRotation(_rb.rotation * Quaternion.Euler(pitch, yaw, roll));

        float target = maxSpeed * throttle * (boosting ? boostMultiplier : 1f);
        currentSpeed = Mathf.MoveTowards(currentSpeed, target, accel * Time.fixedDeltaTime);
        _rb.linearVelocity = transform.forward * currentSpeed;
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
        currentSpeed *= 0.4f;
    }
}
