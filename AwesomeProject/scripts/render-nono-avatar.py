import bpy,sys
from mathutils import Vector
source,target=sys.argv[sys.argv.index('--')+1:][:2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source)
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.79,.8,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
bpy.ops.object.camera_add(location=(0,-8,.6));cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,.45))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=4.4;scene.camera=cam
for loc,energy,size in [((-3,-4,5),450,5),((3,-2,2),120,4),((0,3,4),250,3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=energy;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(Vector((0,0,.4))-l.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.filepath=target
bpy.ops.render.render(write_still=True)
cam.location=(3,-8,1.9);cam.rotation_euler=(Vector((0,0,.45))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=target.replace('.png','-angle.png');bpy.ops.render.render(write_still=True)
