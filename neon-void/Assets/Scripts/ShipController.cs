using UnityEngine;

// Shooter-style controls: mouse-look aims (cursor locked, center
// crosshair), WASD strafes relative to look. SPACE/CTRL dash burst,
// SHIFT holds guard — 50% damage taken, no attacking, 5s cooldown.
public class ShipController : MonoBehaviour
{
    public float moveSpeed = 32f;
    public float accel = 45f;
    public float mouseSens = 2.1f;
    public float dashPower = 60f;
    public float dashCooldownTime = 2f;
    public float guardCooldownTime = 5f;

    [HideInInspector] public float currentSpeed;
    [HideInInspector] public bool guarding;
    [HideInInspector] public float dashCooldown;
    [HideInInspector] public float guardCooldown;

    float _yaw, _pitch, _roll;
    Vector3 _vel;
    Rigidbody _rb;
    Weapon _weapon;
    SkillSystem _skills;
    GameObject _guardBubble;

    void Awake()
    {
        _rb = GetComponent<Rigidbody>();
        _weapon = GetComponent<Weapon>();
        _skills = GetComponent<SkillSystem>();
        Vector3 e = transform.rotation.eulerAngles;
        _yaw = e.y; _pitch = e.x;
        foreach (var t in GetComponentsInChildren<Transform>(true))
            if (t.name == "guardBubble") { _guardBubble = t.gameObject; break; }
    }

    // teleport + aim reset (duel start positions) — keeps the look angles in sync
    public void SetPose(Vector3 pos, float yawDeg)
    {
        _yaw = yawDeg;
        _pitch = 0f;
        transform.position = pos;
        transform.rotation = Quaternion.Euler(0f, yawDeg, 0f);
        if (_rb != null)
        {
            _rb.position = pos;
            _rb.rotation = transform.rotation;
            _rb.linearVelocity = Vector3.zero;
        }
        Physics.SyncTransforms();
    }

    void Update()
    {
        if (!GameManager.I.Running || GameManager.I.Paused) return;

        float sens = mouseSens * GameSettings.MouseSensitivity;
        _yaw += Input.GetAxis("Mouse X") * sens;
        _pitch = Mathf.Clamp(_pitch - Input.GetAxis("Mouse Y") * sens, -85f, 85f);

        dashCooldown = Mathf.Max(0f, dashCooldown - Time.deltaTime);
        guardCooldown = Mathf.Max(0f, guardCooldown - Time.deltaTime);

        // guard: tap G to raise — stays up until you attack (or tap again);
        // 5s cooldown starts the moment it drops
        if (Input.GetKeyDown(KeyCode.G))
        {
            if (guarding) EndGuard();
            else if (guardCooldown <= 0f)
            {
                guarding = true;
                var spc = GetComponent<SpecialAttack>();
                if (spc != null) spc.CancelChannel();   // raising guard interrupts a channeled special
                GameManager.I.PlaySfx(SfxSynth.Pickup, 0.4f);
            }
        }
        if (_guardBubble != null && _guardBubble.activeSelf != guarding)
            _guardBubble.SetActive(guarding);

        // dash: SPACE — burst toward current move input (or facing)
        if (Input.GetKeyDown(KeyCode.Space) && dashCooldown <= 0f)
        {
            dashCooldown = dashCooldownTime;
            Vector3 input = InputDir();
            Vector3 dashDir = AimRotation() * input;
            if (dashDir.sqrMagnitude < 0.01f) dashDir = transform.forward;
            _vel += dashDir.normalized * dashPower;
            GameManager.I.PlaySfx(SfxSynth.Dash, 0.85f);
            ChaseCamera.Shake(0.15f);

            // per-direction acrobatics on the visual model
            var flourish = GetComponent<DashFlourish>();
            if (flourish != null)
            {
                char type = 'W';
                if (input.x < -0.1f) type = 'A';
                else if (input.x > 0.1f) type = 'D';
                else if (input.z < -0.1f) type = 'S';
                flourish.Play(type);
            }
        }

        // attacking breaks guard instantly — the shot still fires
        if (Input.GetMouseButton(0) && _weapon != null)
        {
            if (guarding) EndGuard();
            _weapon.TryFire();
        }
    }

    public void BreakGuard() { if (guarding) EndGuard(); }

    void EndGuard()
    {
        guarding = false;
        guardCooldown = guardCooldownTime;
        if (_guardBubble != null) _guardBubble.SetActive(false);
    }

    // called by DashFlourish when the S-dash flip-turn completes:
    // the somersault+roll physically equals a 180° turn, so committing
    // yaw+180 (with mirrored pitch) hands off with no visual snap
    public void CommitFlip()
    {
        _yaw += 180f;
        _pitch = -_pitch;
        Quaternion q = Quaternion.Euler(_pitch, _yaw, _roll);
        _rb.rotation = q;
        transform.rotation = q;   // bypass interpolation lag — no stale-frame ghost
        Physics.SyncTransforms();
    }

    Vector3 InputDir()
    {
        float h = (Input.GetKey(KeyCode.D) ? 1f : 0f) - (Input.GetKey(KeyCode.A) ? 1f : 0f);
        float fwd = (Input.GetKey(KeyCode.W) ? 1f : 0f) - (Input.GetKey(KeyCode.S) ? 1f : 0f);
        float up = (Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift) ? 1f : 0f)
                 - (Input.GetKey(KeyCode.LeftControl) || Input.GetKey(KeyCode.RightControl) ? 1f : 0f);
        Vector3 dir = new Vector3(h, up, fwd);
        return dir.sqrMagnitude > 1f ? dir.normalized : dir;
    }

    Quaternion AimRotation() =>
        Quaternion.Euler(0f, _yaw, 0f) * Quaternion.AngleAxis(_pitch, Vector3.right);

    void FixedUpdate()
    {
        if (!GameManager.I.Running || GameManager.I.Paused)
        {
            _vel = Vector3.Lerp(_vel, Vector3.zero, 0.04f);
            _rb.linearVelocity = _vel;
            return;
        }

        Vector3 dir = InputDir();
        float speedMult = _skills != null ? _skills.SpeedMult : 1f;
        var acts = GetComponent<ActiveSkills>();
        if (acts != null) speedMult *= acts.SpeedBuffMult;
        Vector3 target = AimRotation() * dir * moveSpeed * speedMult;

        _vel = Vector3.MoveTowards(_vel, target, accel * Time.fixedDeltaTime);
        _rb.linearVelocity = _vel;
        currentSpeed = _vel.magnitude;

        _roll = Mathf.Lerp(_roll, -dir.x * 14f, Time.fixedDeltaTime * 6f);
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
