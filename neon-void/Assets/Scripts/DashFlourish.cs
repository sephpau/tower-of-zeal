using System.Collections;
using UnityEngine;

// Visual-only dash acrobatics on the ship's visual root — aim is untouched.
//  A: 360° barrel roll counter-clockwise      D: 360° clockwise
//  W: forward lunge dip                       S: 180° somersault, then 180° sideways, settle
public class DashFlourish : MonoBehaviour
{
    // flourish rotation this frame — applied to the camera ONLY in
    // first-person view, where every dash spin carries the POV
    public static Quaternion CameraSpin = Quaternion.identity;

    public Transform visualRoot;
    Coroutine _active;

    public void Play(char type)
    {
        if (visualRoot == null) return;
        if (_active != null) { StopCoroutine(_active); CameraSpin = Quaternion.identity; visualRoot.localScale = Vector3.one; }
        switch (type)
        {
            case 'A': _active = StartCoroutine(BarrelRoll(360f)); break;
            case 'D': _active = StartCoroutine(BarrelRoll(-360f)); break;
            case 'S': _active = StartCoroutine(Somersault()); break;
            default: _active = StartCoroutine(Lunge()); break;
        }
    }

    IEnumerator BarrelRoll(float totalDeg)
    {
        const float dur = 0.55f;
        float t = 0f;
        while (t < dur)
        {
            t += Time.deltaTime;
            float k = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(t / dur));
            Quaternion q = Quaternion.Euler(0f, 0f, totalDeg * k);
            visualRoot.localRotation = q;
            CameraSpin = q;
            yield return null;
        }
        visualRoot.localRotation = Quaternion.identity;
        CameraSpin = Quaternion.identity;
        _active = null;
    }

    IEnumerator Lunge()
    {
        const float dur = 0.4f;
        float t = 0f;
        while (t < dur)
        {
            t += Time.deltaTime;
            float k = Mathf.Clamp01(t / dur);
            float dip = Mathf.Sin(k * Mathf.PI) * 14f;      // nose dips and returns
            float stretch = 1f + Mathf.Sin(k * Mathf.PI) * 0.12f;
            Quaternion q = Quaternion.Euler(dip, 0f, 0f);
            visualRoot.localRotation = q;
            CameraSpin = q;
            visualRoot.localScale = new Vector3(1f, 1f, stretch);
            yield return null;
        }
        visualRoot.localRotation = Quaternion.identity;
        visualRoot.localScale = Vector3.one;
        CameraSpin = Quaternion.identity;
        _active = null;
    }

    IEnumerator Somersault()
    {
        // single 180° backflip, then snap straight back — no sideways roll
        yield return Phase(0.34f, k => Quaternion.Euler(-180f * k, 0f, 0f));
        visualRoot.localRotation = Quaternion.identity;
        CameraSpin = Quaternion.identity;
        _active = null;
    }

    IEnumerator Phase(float dur, System.Func<float, Quaternion> rot)
    {
        float t = 0f;
        while (t < dur)
        {
            t += Time.deltaTime;
            Quaternion q = rot(Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(t / dur)));
            visualRoot.localRotation = q;
            CameraSpin = q;
            yield return null;
        }
    }
}
