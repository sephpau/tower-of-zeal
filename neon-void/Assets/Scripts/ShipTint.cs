using System.Collections.Generic;
using UnityEngine;

// Recolors the ship's neon parts to the chosen pilot's accent color.
// The factory registers parts as it builds; StartRun applies the tint.
public class ShipTint : MonoBehaviour
{
    public readonly List<MeshRenderer> accentParts = new List<MeshRenderer>();   // emissive neon (rim, stripes)
    public readonly List<MeshRenderer> glowQuads = new List<MeshRenderer>();     // additive engine glows
    public readonly List<TrailRenderer> trails = new List<TrailRenderer>();
    public Light engineLight;

    public void Apply(Color c)
    {
        var em = NVAssets.Emissive(c, 3.2f);
        foreach (var mr in accentParts)
            if (mr != null) mr.sharedMaterial = em;
        foreach (var mr in glowQuads)
            if (mr != null) mr.material.SetColor("_TintColor", c);
        foreach (var tr in trails)
            if (tr != null)
            {
                tr.startColor = new Color(c.r, c.g, c.b, 0.85f);
                tr.endColor = new Color(c.r * 0.6f, c.g * 0.4f, c.b, 0f);
            }
        if (engineLight != null) engineLight.color = c;
    }
}
