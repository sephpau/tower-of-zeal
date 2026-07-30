using UnityEngine;

// All audio is synthesized at startup into AudioClips — laser, explosions,
// hits, pickups, plus a looping synthwave bass/arp/hat backing track.
public static class SfxSynth
{
    const int SR = 44100;
    public static AudioClip Laser, Boom, BigBoom, Hit, Pickup, WaveUp, Music;

    static bool _built;

    public static void BuildAll()
    {
        if (_built) return;
        _built = true;
        Laser = Render("laser", 0.14f, (t, d) =>
        {
            float f = Mathf.Lerp(1300f, 300f, t / d);
            return Square(f, t) * 0.5f * Decay(t, d, 3f);
        });
        Boom = RenderNoiseBoom("boom", 0.4f, 1600f, 0.8f);
        BigBoom = RenderNoiseBoom("bigboom", 0.9f, 2400f, 1.2f);
        Hit = Render("hit", 0.25f, (t, d) =>
        {
            float f = Mathf.Lerp(190f, 55f, t / d);
            return Saw(f, t) * 0.7f * Decay(t, d, 3f);
        });
        Pickup = RenderArp("pickup", new[] { 523.3f, 659.3f, 784f, 1046.5f }, 0.07f);
        WaveUp = RenderArp("waveup", new[] { 220f, 277.2f, 329.6f, 440f, 554.4f }, 0.09f);
        Music = RenderMusic();
    }

    delegate float Osc(float t, float dur);

    static AudioClip Render(string name, float dur, Osc fn)
    {
        int n = (int)(SR * dur);
        var data = new float[n];
        for (int i = 0; i < n; i++) data[i] = Mathf.Clamp(fn(i / (float)SR, dur), -1f, 1f);
        var clip = AudioClip.Create(name, n, 1, SR, false);
        clip.SetData(data, 0);
        return clip;
    }

    static float Square(float f, float t) => Mathf.Sign(Mathf.Sin(2f * Mathf.PI * f * t)) * 0.5f;
    static float Saw(float f, float t) { float p = f * t; return 2f * (p - Mathf.Floor(p + 0.5f)); }
    static float Tri(float f, float t) { float p = f * t; return 4f * Mathf.Abs(p - Mathf.Floor(p + 0.5f)) - 1f; }
    static float Decay(float t, float d, float k) => Mathf.Exp(-k * t / d * 3f);

    static AudioClip RenderNoiseBoom(string name, float dur, float startFreq, float gain)
    {
        int n = (int)(SR * dur);
        var data = new float[n];
        var rng = new System.Random(1234);
        float lp = 0f;
        for (int i = 0; i < n; i++)
        {
            float t = i / (float)SR;
            float k = 1f - t / dur;
            // crude one-pole lowpass sweeping down
            float cutoff = Mathf.Lerp(120f, startFreq, k * k);
            float alpha = Mathf.Clamp01(2f * Mathf.PI * cutoff / SR);
            float noise = (float)(rng.NextDouble() * 2 - 1);
            lp += alpha * (noise - lp);
            float thump = Mathf.Sin(2f * Mathf.PI * Mathf.Lerp(160f, 36f, t / dur) * t) * k * 0.8f;
            data[i] = Mathf.Clamp((lp * Mathf.Pow(k, 1.4f) + thump) * gain * 0.7f, -1f, 1f);
        }
        var clip = AudioClip.Create(name, n, 1, SR, false);
        clip.SetData(data, 0);
        return clip;
    }

    static AudioClip RenderArp(string name, float[] freqs, float step)
    {
        float dur = freqs.Length * step + 0.15f;
        int n = (int)(SR * dur);
        var data = new float[n];
        for (int noteI = 0; noteI < freqs.Length; noteI++)
        {
            float start = noteI * step;
            int s0 = (int)(start * SR);
            int s1 = Mathf.Min(n, s0 + (int)(0.16f * SR));
            for (int i = s0; i < s1; i++)
            {
                float t = (i - s0) / (float)SR;
                data[i] += Tri(freqs[noteI], t) * 0.35f * Mathf.Exp(-t * 14f);
            }
        }
        var clip = AudioClip.Create(name, n, 1, SR, false);
        clip.SetData(data, 0);
        return clip;
    }

    // 16-step synthwave loop: A-minor bass line, off-beat arps, hat ticks
    static AudioClip RenderMusic()
    {
        float step = 0.21f;
        float[] bass = { 55f, 55f, 65.4f, 55f, 82.4f, 55f, 73.4f, 65.4f,
                         55f, 55f, 65.4f, 55f, 87.3f, 82.4f, 73.4f, 65.4f };
        float[] arp = { 220f, 261.6f, 329.6f, 440f, 329.6f, 261.6f, 440f, 523.3f,
                        220f, 261.6f, 329.6f, 440f, 349.2f, 277.2f, 440f, 523.3f };
        int n = (int)(SR * step * bass.Length);
        var data = new float[n];
        var rng = new System.Random(99);
        for (int s = 0; s < bass.Length; s++)
        {
            int s0 = (int)(s * step * SR);
            int len = (int)(step * SR);
            for (int i = 0; i < len && s0 + i < n; i++)
            {
                float t = i / (float)SR;
                float env = Mathf.Exp(-t * 6f);
                float v = Saw(bass[s], t) * 0.30f * env;
                if (s % 2 == 1) v += Square(arp[s], t) * 0.055f * Mathf.Exp(-t * 9f);
                if (s % 2 == 0 && t < 0.03f) v += (float)(rng.NextDouble() * 2 - 1) * 0.10f * (1f - t / 0.03f);
                data[s0 + i] += v;
            }
        }
        var clip = AudioClip.Create("music", n, 1, SR, false);
        clip.SetData(data, 0);
        return clip;
    }
}
