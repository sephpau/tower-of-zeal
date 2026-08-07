using System.Collections;
using UnityEngine;

// Visual-only dash acrobatics on the ship's visual root — aim is untouched.
//  A: 360° barrel roll counter-clockwise      D: 360° clockwise
//  W: forward lunge dip                       S: 180° somersault, then 180° sideways, settle
public class DashFlourish : MonoBehaviour
{
    // extra rotation the chase camera applies this frame — the S-dash
    // somersault carries the POV through the flip
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
            visualRoot.localRotation = Quaternion.Euler(0f, 0f, totalDeg * k);
            yield return null;
        }
        visualRoot.localRotation = Quaternion.identity;
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
            visualRoot.localRotation = Quaternion.Euler(dip, 0f, 0f);
            visualRoot.localScale = new Vector3(1f, 1f, stretch);
            yield return null;
        }
        visualRoot.localRotation = Quaternion.identity;
        visualRoot.localScale = Vector3.one;
        _active = null;
    }

    IEnumerator Somersault()
    {
        // POV rides along: the camera flips with the ship, world wheels around
        // phase 1: 180° backflip
        yield return Phase(0.32f, k => Quaternion.Euler(-180f * k, 0f, 0f));
        // phase 2: 180° sideways roll on top of the flip
        yield return Phase(0.28f, k => Quaternion.Euler(0f, 0f, 180f * k) * Quaternion.Euler(-180f, 0f, 0f));
        // done — snap straight back to the original pov, no extra spin
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
