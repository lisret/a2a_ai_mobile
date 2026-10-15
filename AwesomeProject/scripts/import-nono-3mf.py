"""Run with Blender --background --python scripts/import-nono-3mf.py -- SOURCE OUTPUT_JSON.

Reads data only from the user's 3MF; never executes embedded source scripts.
Model dimensions are millimetres. Output uses Three.js Y-up, facing +Z.
"""
import bpy
import bmesh
import sys
import json
import hashlib
import xml.etree.ElementTree as ET
from zipfile import ZipFile
from mathutils import Vector

source, target = sys.argv[sys.argv.index('--') + 1:][:2]
ns = {'c': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02',
      'p': 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06'}
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metallic=0, roughness=.35, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Emission Color'].default_value = (*color, 1)
    bsdf.inputs['Emission Strength'].default_value = emission
    return mat

white = material('Ceramic', (.83, .87, .88), .08, .28)
black = material('Screen', (.008, .014, .022), .12, .24)
cyan = material('Light', (.005, .65, .7), .12, .27, .3)
# Exclude stand (2), loose magnetic plugs (8/12/16/20), printing connector (24).
parts = {'4': ('Shell', white), '6': ('Visor', black),
         '10': ('EarRight', cyan), '14': ('EarLeft', cyan),
         '18': ('FinLeft', cyan), '22': ('FinRight', cyan)}
meshes = []
with ZipFile(source) as z:
    main = ET.fromstring(z.read('3D/3dmodel.model'))
    config = ET.fromstring(z.read('Metadata/model_settings.config'))
    assembly = {a.get('object_id'): [float(v) for v in a.get('transform').split()]
                for a in config.findall('assemble/assemble_item')}
    for entry in main.findall('c:resources/c:object', ns):
        oid = entry.get('id')
        if oid not in parts:
            continue
        name, mat = parts[oid]
        comp = entry.find('c:components/c:component', ns)
        path = comp.get('{'+ns['p']+'}path').lstrip('/')
        data = ET.fromstring(z.read(path))
        verts = [tuple(float(v.get(k)) for k in ('x', 'y', 'z'))
                 for v in data.findall('.//c:vertex', ns)]
        faces = [tuple(int(v.get(k)) for k in ('v1', 'v2', 'v3'))
                 for v in data.findall('.//c:triangle', ns)]
        shift = assembly[oid][9:12]
        if oid == '6':
            # The printing profile stores the visor at the plate origin.
            # Original STL source offsets restore it relative to the shell.
            shift = [0, -11.4004356, 20.7158697]
        verts = [((v[0]+shift[0])/17.4, (v[1]+shift[1])/17.4,
                  (v[2]+shift[2]-17.3763218)/17.4) for v in verts]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        # STL triangle islands must be welded before smoothing or seams split.
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0001)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        dec = obj.modifiers.new('Mobile mesh reduction', 'DECIMATE')
        dec.ratio = .25 if len(faces) > 20000 else .45
        bpy.ops.object.modifier_apply(modifier=dec.name)
        for poly in obj.data.polygons:
            poly.use_smooth = True
        obj.data.materials.append(mat)
        obj.data.calc_loop_triangles()
        positions = [[v.co.x, v.co.z, -v.co.y] for v in obj.data.vertices]
        normals = [[v.normal.x, v.normal.z, -v.normal.y] for v in obj.data.vertices]
        triangles = [list(t.vertices) for t in obj.data.loop_triangles]
        meshes.append({'name': name, 'positions': positions, 'normals': normals,
                       'triangles': triangles, 'sourceObject': oid})
        obj.select_set(False)
    provenance = {m.get('name'): m.text for m in main.findall('c:metadata', ns)
                  if m.get('name') in ['Designer', 'License', 'Title', 'DesignModelId']}

with open(source, 'rb') as f:
    provenance['sha256'] = hashlib.sha256(f.read()).hexdigest()
with open(target, 'w') as f:
    json.dump({'provenance': provenance, 'meshes': meshes}, f, separators=(',', ':'))
print('EXPORTED', [(m['name'], len(m['triangles'])) for m in meshes])

# Actual source-mesh render for assembly inspection, not an image mockup.
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 20
scene.world.color = (.55, .55, .55)
bpy.ops.object.camera_add(location=(0, -7, .6))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, .5))-camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 4.2
scene.camera = camera
for loc, energy, size in [((-3,-4,5),500,4), ((3,-2,2),180,3), ((0,3,4),400,3)]:
    bpy.ops.object.light_add(type='AREA', location=loc)
    lamp = bpy.context.object
    lamp.data.energy = energy
    lamp.data.shape = 'DISK'
    lamp.data.size = size
    lamp.rotation_euler = (Vector((0,0,.4))-lamp.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x = 800
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.filepath = target + '.png'
scene.render.film_transparent = False
bpy.ops.wm.save_as_mainfile(filepath=target + '.blend')
bpy.ops.render.render(write_still=True)
