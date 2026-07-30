using UnityEngine;

// Smooth procedural meshes: lathed (revolved) hulls and swept airfoil wings.
// This is what makes the ships read as ships instead of boxes.
public static class NVMeshes
{
    // Revolve a 2D profile (radius, z) around the Z axis. Smooth normals.
    public static Mesh Lathe(Vector2[] profile, int segments = 24)
    {
        int rings = profile.Length;
        var verts = new Vector3[rings * (segments + 1)];
        var uvs = new Vector2[verts.Length];
        for (int r = 0; r < rings; r++)
        {
            for (int s = 0; s <= segments; s++)
            {
                float a = s / (float)segments * Mathf.PI * 2f;
                verts[r * (segments + 1) + s] = new Vector3(
                    Mathf.Cos(a) * profile[r].x,
                    Mathf.Sin(a) * profile[r].x,
                    profile[r].y);
                uvs[r * (segments + 1) + s] = new Vector2(s / (float)segments, r / (float)(rings - 1));
            }
        }
        var tris = new int[(rings - 1) * segments * 6];
        int t = 0;
        for (int r = 0; r < rings - 1; r++)
            for (int s = 0; s < segments; s++)
            {
                int a = r * (segments + 1) + s;
                int b = a + segments + 1;
                tris[t++] = a; tris[t++] = a + 1; tris[t++] = b;
                tris[t++] = a + 1; tris[t++] = b + 1; tris[t++] = b;
            }
        var m = new Mesh { vertices = verts, uv = uvs, triangles = tris };
        m.RecalculateNormals();
        FixSeamNormals(m, segments, rings);
        m.RecalculateBounds();
        return m;
    }

    // average the duplicated seam column so the lathe has no lighting seam
    static void FixSeamNormals(Mesh m, int segments, int rings)
    {
        var n = m.normals;
        for (int r = 0; r < rings; r++)
        {
            int a = r * (segments + 1);
            int b = a + segments;
            Vector3 avg = (n[a] + n[b]).normalized;
            n[a] = avg; n[b] = avg;
        }
        m.normals = n;
    }

    // Tapered swept wing with a hexagonal airfoil cross-section.
    // Extends along +X; leading edge toward +Z; sweep pushes the tip back (-Z).
    public static Mesh Wing(float span, float rootChord, float tipChord, float sweep, float thickness)
    {
        Vector2[] foil = {
            new Vector2( 0.5f,  0f),        // leading edge
            new Vector2( 0.15f, 0.5f),
            new Vector2(-0.3f,  0.35f),
            new Vector2(-0.5f,  0f),        // trailing edge
            new Vector2(-0.3f, -0.35f),
            new Vector2( 0.15f, -0.5f),
        };
        int n = foil.Length;
        var verts = new Vector3[n * 2 + 2];
        for (int i = 0; i < n; i++)
        {
            // root section
            verts[i] = new Vector3(0f, foil[i].y * thickness, foil[i].x * rootChord);
            // tip section (translated back by sweep, scaled down)
            verts[n + i] = new Vector3(span, foil[i].y * thickness * 0.55f, foil[i].x * tipChord - sweep);
        }
        int c0 = n * 2, c1 = n * 2 + 1;
        verts[c0] = new Vector3(0f, 0f, 0f);
        verts[c1] = new Vector3(span, 0f, -sweep);

        var tris = new System.Collections.Generic.List<int>();
        for (int i = 0; i < n; i++)
        {
            int j = (i + 1) % n;
            tris.AddRange(new[] { i, n + i, n + j });
            tris.AddRange(new[] { i, n + j, j });
            // caps
            tris.AddRange(new[] { c0, j, i });
            tris.AddRange(new[] { c1, n + i, n + j });
        }
        var m = new Mesh { vertices = verts, triangles = tris.ToArray() };
        m.RecalculateNormals();
        m.RecalculateBounds();
        return m;
    }

    public static GameObject Part(GameObject parent, Mesh mesh, Material mat, Vector3 pos, Vector3 euler, Vector3 scale)
    {
        var go = new GameObject("part");
        go.transform.SetParent(parent.transform, false);
        go.transform.localPosition = pos;
        go.transform.localRotation = Quaternion.Euler(euler);
        go.transform.localScale = scale;
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        go.AddComponent<MeshRenderer>().sharedMaterial = mat;
        return go;
    }

    public static GameObject SpherePart(GameObject parent, Material mat, Vector3 pos, Vector3 scale)
    {
        var s = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        Object.Destroy(s.GetComponent<Collider>());
        s.transform.SetParent(parent.transform, false);
        s.transform.localPosition = pos;
        s.transform.localScale = scale;
        s.GetComponent<MeshRenderer>().sharedMaterial = mat;
        return s;
    }
}
