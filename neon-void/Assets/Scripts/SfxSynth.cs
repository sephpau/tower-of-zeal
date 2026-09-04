using UnityEngine;

// All audio is synthesized at startup into AudioClips — laser, explosions,
// hits, pickups, plus a looping synthwave bass/arp/hat backing track.
public static class SfxSynth
{
    const int SR = 44100;
    public static AudioClip Laser, Boom, BigBoom, Hit, Pickup, WaveUp, Music;
    public static AudioClip MusicBoss;              // v1 intensity-3 layer: drums join
    public static AudioClip HitPulse, HitSpecial;   // hit-confirm cues
    public static AudioClip Dash;                   // dash whoosh
    public static AudioClip Crash;                  // death crunch: blast + debris tail
    public static AudioClip Click, Swish;           // UI: button click + panel swish

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
        // dash: a real air swish - filtered noise only, no tones (tones read like a UI chime)
        Dash = RenderSwish("dash", 0.3f);
        // UI feedback: crisp click on any button, soft swish on panel changes
        Click = Render("click", 0.06f, (t, d) =>
        {
            float f = Mathf.Lerp(1600f, 900f, t / d);
            return Square(f, t) * 0.5f * Decay(t, d, 5f);
        });
        Swish = Render("swish", 0.22f, (t, d) =>
        {
            float k = t / d;
            float env = Mathf.Sin(k * Mathf.PI);
            float noise = (Mathf.Sin(t * 5200f) + Mathf.Sin(t * 8900f)) / 2f;
            return noise * env * 0.35f * (1f - 0.5f * k);
        });
        // bright tick when a pulse shot connects
        HitPulse = Render("hitpulse", 0.07f, (t, d) =>
        {
            float f = Mathf.Lerp(1900f, 750f, t / d);
            return Square(f, t) * 0.55f * Decay(t, d, 4f);
        });
        // meatier crunch-zap when a special connects
        HitSpecial = Render("hitspecial", 0.18f, (t, d) =>
        {
            float f = Mathf.Lerp(620f, 130f, t / d);
            return (Saw(f, t) * 0.55f + Tri(f * 2.7f, t) * 0.3f) * Decay(t, d, 2.6f);
        });
        // death crash: falling growl + crunchy blast + late debris ticks
        Crash = Render("crash", 0.72f, (t, d) =>
        {
            float k = t / d;
            float growl = Saw(Mathf.Lerp(230f, 38f, k), t) * 0.55f * Decay(t, d, 2.2f);
            float noise = (Mathf.Sin(t * 5173f) + Mathf.Sin(t * 8311f) + Mathf.Sin(t * 12889f)) / 3f;
            float crunch = noise * Mathf.Exp(-6f * k) * 0.6f;
            float debris = (Mathf.PingPong(t * 913f, 1f) > 0.93f && k > 0.25f ? 0.45f : 0f) * Mathf.Exp(-3f * k);
            return (growl + crunch + debris) * 0.95f;
        });
        Pickup = RenderArp("pickup", new[] { 523.3f, 659.3f, 784f, 1046.5f }, 0.07f);
        WaveUp = RenderArp("waveup", new[] { 220f, 277.2f, 329.6f, 440f, 554.4f }, 0.09f);
        Music = RenderZealMusic(2, "music");        // bass + pad + arp + melody
        MusicBoss = RenderZealMusic(3, "musicBoss"); // + kick and hats
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

    // Swish: white noise through a band-pass whose center sweeps down (6 kHz -> 700 Hz)
    // with a snappy attack and a breathy tail. Pure noise, so it reads as air, not a note.
    static AudioClip RenderSwish(string name, float dur)
    {
        int n = (int)(SR * dur);
        var data = new float[n];
        var rng = new System.Random(4242);
        float lpHi = 0f, lpLo = 0f;
        for (int i = 0; i < n; i++)
        {
            float t = i / (float)SR;
            float k = t / dur;
            float env = Mathf.Min(1f, k / 0.08f) * Mathf.Pow(1f - k, 1.6f);
            float center = Mathf.Lerp(6000f, 700f, Mathf.Pow(k, 0.7f));
            float aHi = Mathf.Clamp01(2f * Mathf.PI * center / SR);
            float aLo = Mathf.Clamp01(2f * Mathf.PI * (center * 0.35f) / SR);
            float noise = (float)(rng.NextDouble() * 2 - 1);
            lpHi += aHi * (noise - lpHi);
            lpLo += aLo * (noise - lpLo);
            float band = lpHi - lpLo;   // band-pass: keeps the rush, drops the rumble and the hiss
            data[i] = Mathf.Clamp(band * env * 2.6f, -1f, 1f);
        }
        var clip = AudioClip.Create(name, n, 1, SR, false);
        clip.SetData(data, 0);
        return clip;
    }

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

    // ---- Zeal Survivors v1 soundtrack, ported note-for-note ----
    // Dark-carnival chiptune in A minor: 112 BPM, 32-step loop.
    // Layers by intensity: bass+pad / +arp / +melody / +drums (boss).
    static readonly int[] V1Bass = { 57,57,57,57, 53,53,53,53, 55,55,55,55, 52,52,52,52,
                                     57,57,57,57, 53,53,53,53, 55,55,55,55, 59,59,60,60 };
    static readonly int[] V1Arp  = { 69,72,76,72, 65,69,72,69, 67,71,74,71, 64,67,71,67,
                                     69,72,76,72, 65,69,72,69, 67,71,74,71, 71,74,72,76 };
    static readonly int[] V1Mel  = { 81,0,79,0, 77,0,76,0, 79,0,77,0, 76,0,74,0,
                                     81,0,84,0, 83,0,81,0, 79,0,77,0, 83,0,84,0 };

    static float MidiToFreq(int m) => 440f * Mathf.Pow(2f, (m - 69) / 12f);

    static AudioClip RenderZealMusic(int intensity, string name)
    {
        const float BPM = 112f;
        float step = 60f / BPM / 2f;   // 8th notes, exactly v1
        int total = (int)(SR * step * 32);
        var data = new float[total];

        // additive note writer with v1's envelope (10ms attack, exp decay);
        // wraps past the loop end so the seam is seamless
        void Note(int startStep, int midi, float dur, System.Func<float, float, float> osc, float vol)
        {
            if (midi <= 0) return;
            float f = MidiToFreq(midi);
            int s0 = (int)(startStep * step * SR);
            int len = (int)(dur * SR);
            for (int i = 0; i < len; i++)
            {
                float t = i / (float)SR;
                float env = t < 0.01f
                    ? vol * (t / 0.01f)
                    : vol * Mathf.Pow(0.001f, (t - 0.01f) / Mathf.Max(0.01f, dur - 0.01f));
                data[(s0 + i) % total] += osc(f, t) * env;
            }
        }

        float SineOsc(float f, float t) => Mathf.Sin(2f * Mathf.PI * f * t);
        float TriOsc(float f, float t) => Tri(f, t);
        float SquareOsc(float f, float t) => Mathf.Sign(Mathf.Sin(2f * Mathf.PI * f * t));
        float SawOsc(float f, float t) => Saw(f, t);

        var rng = new System.Random(7);
        for (int s = 0; s < 32; s++)
        {
            Note(s, V1Bass[s] - 12, step * 1.8f, TriOsc, 0.16f);
            if (s % 8 == 0)
            {
                Note(s, V1Bass[s], step * 7f, SineOsc, 0.05f);
                Note(s, V1Bass[s] + 3, step * 7f, SineOsc, 0.04f);
                Note(s, V1Bass[s] + 7, step * 7f, SineOsc, 0.04f);
            }
            if (intensity >= 1) Note(s, V1Arp[s], step * 0.9f, SquareOsc, 0.035f);
            if (intensity >= 2) Note(s, V1Mel[s], step * 1.6f, SawOsc, 0.04f);
            if (intensity >= 3)
            {
                int s0 = (int)(s * step * SR);
                if (s % 4 == 0)   // kick: sine sweep 150 -> 45
                {
                    int len = (int)(0.13f * SR);
                    float phase = 0f;
                    for (int i = 0; i < len; i++)
                    {
                        float t = i / (float)SR;
                        float freq = 150f * Mathf.Pow(45f / 150f, t / 0.12f);
                        phase += 2f * Mathf.PI * freq / SR;
                        data[(s0 + i) % total] += Mathf.Sin(phase) * 0.25f * Mathf.Pow(0.001f, t / 0.13f);
                    }
                }
                if (s % 2 == 1)   // hat: highpassed noise tick
                {
                    int len = (int)(0.045f * SR);
                    float prev = 0f;
                    for (int i = 0; i < len; i++)
                    {
                        float n = (float)(rng.NextDouble() * 2 - 1);
                        float hp = n - prev; prev = n;   // crude first-order highpass
                        data[(s0 + i) % total] += hp * 0.05f * (1f - i / (float)len);
                    }
                }
            }
        }

        for (int i = 0; i < total; i++) data[i] = Mathf.Clamp(data[i], -1f, 1f);
        var clip = AudioClip.Create(name, total, 1, SR, false);
        clip.SetData(data, 0);
        return clip;
    }
}
