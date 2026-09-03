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
        Debug.Log("TotemImport: extracted=" + ok + " -> " + TexDir);
        foreach (string guid in AssetDatabase.FindAssets("t:Texture2D", new[] { TexDir }))
            Debug.Log("TotemImport: texture " + AssetDatabase.GUIDToAssetPath(guid));
    }
}
