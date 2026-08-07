using UnityEngine;

// Third-person chase cam by default; V toggles a first-person cockpit
// view. Dash spins (barrel rolls, somersault) move the POV only in
// first person — in third person the camera stays steady and you watch
// the ship do the acrobatics.
public class ChaseCamera : MonoBehaviour
{
    public Transform target;
    public Vector3 offset = new Vector3(0f, 2.4f, -8.5f);
    public Vector3 fpOffset = new Vector3(0f, 0.6f, 0.4f);   // inside the dome

    public static bool FirstPerson;

    static float _shake;
    Camera _cam;
    ShipController _ship;
    Transform _visual;

    public static void Shake(float amount) { _shake = Mathf.Max(_shake, amount); }

    void Awake() { _cam = GetComponent<Camera>(); }

    void Update()
    {
        if (Input.GetKeyDown(KeyCode.V))
        {
            FirstPerson = !FirstPerson;
            if (_visual != null) _visual.gameObject.SetActive(!FirstPerson);
        }
    }

    void LateUpdate()
    {
        if (target == null)
        {
            _ship = FindAnyObjectByType<ShipController>();
            if (_ship != null) target = _ship.transform;
            else return;
        }
        if (_ship == null) _ship = target.GetComponent<ShipController>();
        if (_visual == null)
        {
            _visual = target.Find("visual");
            if (_visual != null && FirstPerson) _visual.gameObject.SetActive(false);
        }

        if (FirstPerson)
        {
            // cockpit view: rigid, and every flourish spin carries the POV
            transform.position = target.TransformPoint(fpOffset);
            transform.rotation = target.rotation * DashFlourish.CameraSpin;
        }
        else
        {
            // rigid shooter cam glued behind the ship, steady through spins
            Vector3 desired = target.position + target.rotation * offset;
            transform.position = Vector3.Lerp(transform.position, desired, 1f - Mathf.Exp(-Time.deltaTime * 18f));
            transform.rotation = Quaternion.Slerp(transform.rotation, target.rotation, 1f - Mathf.Exp(-Time.deltaTime * 22f));
        }

        // shake
        if (_shake > 0.001f)
        {
            transform.position += Random.insideUnitSphere * _shake * 0.35f;
            _shake = Mathf.Max(0f, _shake - Time.deltaTime * 2.2f);
        }

        // FOV kick with speed (dash bursts spike it naturally)
        float speedK = _ship != null ? Mathf.InverseLerp(0f, 80f, _ship.currentSpeed) : 0f;
        float targetFov = 62f + speedK * 18f;
        _cam.fieldOfView = Mathf.Lerp(_cam.fieldOfView, targetFov, 1f - Mathf.Exp(-Time.deltaTime * 4f));
    }
}
