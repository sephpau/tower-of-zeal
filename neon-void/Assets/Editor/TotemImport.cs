using UnityEditor;
using UnityEngine;

// One-shot: pull the textures embedded in the Doom Totem FBX out to disk so
// its materials survive Unity's import (embedded FBX textures are dropped).
//   Unity.exe -batchmode -quit -projectPath <proj> -executeMethod TotemImport.Extract
public static class TotemImport
{
    const string Fbx = "Assets/Resources/decimation/doom_totem.fbx";
    const string TexDir = "Assets/Resources/decimation/tex";

    [MenuItem("Zeal Survivors/Extract Doom Totem textures")]
    public static void Extract()
    {
        AssetDatabase.ImportAsset(Fbx, ImportAssetOptions.ForceUpdate);
        var imp = AssetImporter.GetAtPath(Fbx) as ModelImporter;
        if (imp == null) { Debug.LogError("TotemImport: importer missing for " + Fbx); return; }
        if (!AssetDatabase.IsValidFolder(TexDir)) AssetDatabase.CreateFolder("Assets/Resources/decimation", "tex");
        bool ok = imp.ExtractTextures(TexDir);
        imp.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
        imp.SaveAndReimport();
        AssetDatabase.Refresh();
        // ExtractTextures can write image files with no extension, which Unity then
        // imports as plain assets (no texture): sniff the header and rename them
        foreach (string f in System.IO.Directory.GetFiles(TexDir))
        {
            if (f.EndsWith(".meta") || System.IO.Path.HasExtension(f)) continue;
            var head = new byte[4];
            using (var fs = System.IO.File.OpenRead(f)) fs.Read(head, 0, 4);
            string ext = head[0] == 0xFF && head[1] == 0xD8 ? ".jpg" : head[0] == 0x89 && head[1] == 0x50 ? ".png" : null;
            if (ext == null) continue;
            string asset = f.Replace('\\', '/');
            AssetDatabase.RenameAsset(asset, System.IO.Path.GetFileName(f) + ext);
            Debug.Log("TotemImport: renamed " + System.IO.Path.GetFileName(f) + " -> " + ext);
        }
        AssetDatabase.Refresh();
        Debug.Log("TotemImport: extracted=" + ok + " -> " + TexDir);
        foreach (string guid in AssetDatabase.FindAssets("t:Texture2D", new[] { TexDir }))
            Debug.Log("TotemImport: texture " + AssetDatabase.GUIDToAssetPath(guid));
    }
}
