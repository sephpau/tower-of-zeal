using UnityEngine;

public class ChaseCamera : MonoBehaviour
{
    public Transform target;
    public Vector3 offset = new Vector3(0f, 2.4f, -8.5f);

    static float _shake;
    Camera _cam;
    ShipController _ship;

    public static void Shake(float amount) { _shake = Mathf.Max(_shake, amount); }

    void Awake() { _cam = GetComponent<Camera>(); }

    void LateUpdate()
    {
        if (target == null)
        {
            _ship = FindAnyObjectByType<ShipController>();
            if (_ship != null) target = _ship.transform;
            else return;
        }
        if (_ship == null) _ship = target.GetComponent<ShipController>();

        // rigid shooter cam: glued behind the ship, looking where it looks
        Vector3 desired = target.position + target.rotation * offset;
        transform.position = Vector3.Lerp(transform.position, desired, 1f - Mathf.Exp(-Time.deltaTime * 18f));
        transform.rotation = Quaternion.Slerp(transform.rotation, target.rotation, 1f - Mathf.Exp(-Time.deltaTime * 22f));

        // shake
        if (_shake > 0.001f)
        {
            transform.position += Random.insideUnitSphere * _shake * 0.35f;
            _shake = Mathf.Max(0f, _shake - Time.deltaTime * 2.2f);
        }

        // FOV kick with speed + boost
        float speedK = _ship != null ? Mathf.InverseLerp(0f, 65f, _ship.currentSpeed) : 0f;
        float targetFov = 62f + speedK * 16f + (_ship != null && _ship.boosting ? 4f : 0f);
        _cam.fieldOfView = Mathf.Lerp(_cam.fieldOfView, targetFov, 1f - Mathf.Exp(-Time.deltaTime * 4f));
    }
}
