using UnityEngine;
using UnityEngine.UI;

// A maxed-out rank gauge on fire: the fill flickers between ember red and
// flame yellow, a soft glow breathes behind the tank, and embers drift up
// off the top edge. Pure UI images, no particles, unscaled time (menus).
public class FuelBurnFx : MonoBehaviour
{
    Image _fill, _glow;
    RectTransform[] _embers;
    Image[] _emberImg;
    float[] _phase, _speed, _x;
    float _seed, _barW, _barH;

    public void Init(Image fill, Image glow, Sprite rounded, float barW, float barH)
    {
        _fill = fill; _glow = glow; _barW = barW; _barH = barH;
        _seed = Random.value * 100f;
        int n = 7;
        _embers = new RectTransform[n]; _emberImg = new Image[n];
        _phase = new float[n]; _speed = new float[n]; _x = new float[n];
        for (int i = 0; i < n; i++)
        {
            var go = new GameObject("ember" + i);
            go.transform.SetParent(glow.transform, false);
            var img = go.AddComponent<Image>();
            img.sprite = rounded; img.type = Image.Type.Sliced;
            img.raycastTarget = false;
            var rt = img.rectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            float s = Random.Range(3f, 6f);
            rt.sizeDelta = new Vector2(s, s * Random.Range(1.2f, 2.2f));
            _embers[i] = rt; _emberImg[i] = img;
            _phase[i] = Random.value; _speed[i] = Random.Range(0.45f, 0.9f);
            _x[i] = Random.Range(-0.46f, 0.46f) * barW;
        }
    }

    void Update()
    {
        if (_fill == null || _glow == null) return;
        float t = Time.unscaledTime;
        float flick = Mathf.PerlinNoise(t * 7f, _seed);
        _fill.color = Color.Lerp(new Color(1f, 0.32f, 0.06f), new Color(1f, 0.86f, 0.28f), flick);
        float breathe = 0.16f + 0.22f * Mathf.PerlinNoise(t * 3.5f, _seed + 9f);
        _glow.color = new Color(1f, 0.42f + 0.15f * flick, 0.08f, breathe);
        for (int i = 0; i < _embers.Length; i++)
        {
            float p = (_phase[i] + t * _speed[i]) % 1f;   // 0 = leave the tank, 1 = gone
            float wob = Mathf.Sin((t + i) * 5f) * 3f;
            _embers[i].anchoredPosition = new Vector2(_x[i] + wob, _barH * 0.5f + p * 22f);
            float a = (1f - p) * (p < 0.15f ? p / 0.15f : 1f);
            _emberImg[i].color = new Color(1f, Mathf.Lerp(0.85f, 0.3f, p), 0.15f, a * 0.9f);
        }
    }
}
