"""Original FL5 reference model, authored in Blender. No downloaded mesh is used.

Run: blender --background --factory-startup --python scripts/blender/build-civic.py
Coordinates in this script are website coordinates: X across, Y up, Z forward.
Photographic references inform the surfaces; this is not manufacturer CAD.
"""
import bpy, math, os, json
from mathutils import Vector
from math import sin, cos, pi, sqrt, exp

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
OUT = os.path.join(ROOT, 'public/models/civic-type-r')
SOURCE = os.path.join(ROOT, 'assets/showcase')
os.makedirs(OUT, exist_ok=True)
os.makedirs(SOURCE, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def v(p): return Vector((p[0], -p[2], p[1]))
def mat(name, color, rough=.4, metal=0, coat=0, alpha=1, emission=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color, alpha)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    p.inputs['Coat Weight'].default_value=coat
    p.inputs['Coat Roughness'].default_value=.13
    p.inputs['Alpha'].default_value=alpha
    if emission:
        p.inputs['Emission Color'].default_value=(*color, 1)
        p.inputs['Emission Strength'].default_value=emission
    m.diffuse_color=(*color,alpha)
    if alpha<1: m.surface_render_method='DITHERED'
    return m

M={
 'Paint':mat('Paint',(.82,.81,.74),.21,.18,1),
 'Glass':mat('Glass',(.12,.19,.19),.055,.12,1,.3),
 'Lens':mat('Lens',(.12,.15,.17),.08,.2,1,.16),
 'GlossBlack':mat('GlossBlack',(.009,.011,.013),.19,.22,1),
 'Rubber':mat('Rubber',(.009,.01,.012),.83),
 'Tyre':mat('Tyre',(.017,.019,.022),.88),
 'Alloy':mat('Alloy',(.035,.038,.045),.29,.85),
 'Chrome':mat('Chrome',(.53,.58,.62),.23,.95),
 'Brake':mat('Brake',(.23,.25,.27),.48,.86),
 'Caliper':mat('Caliper',(.52,.008,.019),.32,.3,.5),
 'Leather':mat('Leather',(.016,.019,.024),.83),
 'Suede':mat('Suede',(.48,.008,.026),.96),
 'SeatShell':mat('SeatShell',(.01,.012,.018),.59),
 'Carpet':mat('Carpet',(.25,.007,.016),1),
 'Headlight':mat('Headlight',(.7,.85,1),.17,.15,0,1,2),
 'Taillight':mat('Taillight',(.62,.002,.008),.22,.1,1,1,1.3),
 'TailLens':mat('TailLens',(.15,.001,.004),.16,.2,1),
 'Amber':mat('Amber',(.9,.17,.009),.2,.15),
 'White':mat('White',(.75,.78,.8),.45),
 'Screen':mat('Screen',(.006,.009,.014),.25),
 'Stitch':mat('Stitch',(.28,.009,.016),.8),
}
rigs={}
def empty(name, p=(0,0,0), parent=None):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o)
    o.location=v(p)
    if parent: o.parent=parent
    return o
root=empty('Civic_Type_R_FL5')

def mesh(name, verts, faces, material, parent=root, smooth=True):
    data=bpy.data.meshes.new(name); data.from_pydata([v(p) for p in verts],[],faces); data.update()
    o=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(o)
    o.data.materials.append(M[material] if isinstance(material,str) else material)
    if parent: o.parent=parent
    for p in data.polygons: p.use_smooth=smooth
    # Recalculate normals consistently, important for reflection continuity.
    bpy.context.view_layer.objects.active=o; o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
    o.select_set(False)
    return o

def surface(name, fn, nu, nv, material, parent=root):
    verts=[fn(i/nu,j/nv) for j in range(nv+1) for i in range(nu+1)]
    faces=[]
    for j in range(nv):
        for i in range(nu):
            a=j*(nu+1)+i; faces.append((a,a+1,a+nu+2,a+nu+1))
    return mesh(name,verts,faces,material,parent)

def box(name,p,size,material,bevel=.008,parent=root):
    bpy.ops.mesh.primitive_cube_add(size=1,location=v(p)); o=bpy.context.object; o.name=name
    o.dimensions=(size[0],size[2],size[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(M[material]); o.parent=parent
    if bevel:
        mod=o.modifiers.new('Machined edges','BEVEL'); mod.width=bevel; mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for f in o.data.polygons:f.use_smooth=True
    mod=o.modifiers.new('Panel normals','WEIGHTED_NORMAL'); mod.keep_sharp=True
    bpy.ops.object.modifier_apply(modifier=mod.name); o.select_set(False)
    return o

def tube(name,points,r,material,parent=root,cyclic=False,res=3):
    data=bpy.data.curves.new(name,'CURVE'); data.dimensions='3D'; data.resolution_u=2
    data.bevel_depth=r; data.bevel_resolution=res
    s=data.splines.new('POLY'); s.points.add(len(points)-1)
    for co,p in zip(s.points,points): co.co=(*v(p),1)
    s.use_cyclic_u=cyclic
    o=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(o); o.parent=parent
    data.materials.append(M[material]); return o

def lerp(a,b,t):return tuple(x+(y-x)*t for x,y in zip(a,b))
def curve(points,steps=8):
    # Centripetal-looking cubic interpolation with clamped end points.
    out=[]
    for k in range(len(points)-1):
        p0=points[max(0,k-1)];p1=points[k];p2=points[k+1];p3=points[min(len(points)-1,k+2)]
        for j in range(steps):
            t=j/steps
            out.append(tuple(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t) for a,b,c,d in zip(p0,p1,p2,p3)))
    return out+[points[-1]]

def path(name,points,r,material,parent=root,cyclic=False):
    return tube(name,curve(points),r,material,parent,cyclic)

def cylinder(name,p,r,depth,material,axis='x',parent=root,n=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=depth,location=v(p))
    o=bpy.context.object;o.name=name
    if axis=='x':o.rotation_euler[1]=pi/2
    elif axis=='z':o.rotation_euler[0]=pi/2
    o.data.materials.append(M[material]);o.parent=parent
    for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
    o.select_set(False);return o

def lathe(name,profile,material,parent=root,axis='x',p=(0,0,0),n=80):
    verts=[]; faces=[]
    for axial,r in profile:
        for i in range(n):
            a=i*2*pi/n
            q=(axial,r*cos(a),r*sin(a)) if axis=='x' else (r*cos(a),r*sin(a),axial)
            verts.append(tuple(q[j]+p[j] for j in range(3)))
    for j in range(len(profile)-1):
        for i in range(n):
            a=j*n+i;b=j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    return mesh(name,verts,faces,material,parent)

def polygon(name,points,material,thickness=.008,parent=root,bevel=.004):
    o=mesh(name,points,[tuple(range(len(points)))],material,parent,False)
    if thickness:
        mod=o.modifiers.new('Panel thickness','SOLIDIFY');mod.thickness=thickness
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    if bevel:
        mod=o.modifiers.new('Soft edges','BEVEL');mod.width=bevel;mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
        for f in o.data.polygons:f.use_smooth=True
    return o

# Reference profile landmarks, in metres. Honda FL5: 4.593 / 1.890 / 1.407.
FRONT=1.385; REAR=-1.350; R=.321
def width(z):
    return .884+.058*exp(-((z-FRONT)/.49)**2)+.060*exp(-((z-REAR)/.52)**2)-.028*(abs(z)/2.3)**7
def shoulder(z):return .935+.015*cos(z*.75)-.128*max(0,(z-1.25)/1.05)**1.4+.024*max(0,(-z-1.2)/1.1)
def side_x(z,y):
    w=width(z)
    t=max(0,min(1,(y-.19)/(shoulder(z)-.19)))
    return w-.034*(1-t)**3+.008*sin(t*pi)-.019*exp(-((t-.31)/.15)**2)-.012*exp(-((t-.86)/.11)**2)

for s in [-1,1]:
    def flank(u,t,s=s):
        z=-2.11+4.22*u; bottom=.195
        for a in [FRONT,REAR]:
            d=z-a
            if abs(d)<.347:bottom=max(bottom,R+sqrt(.347**2-d*d))
        y=bottom+(shoulder(z)-bottom)*t
        return (s*side_x(z,y),y,z)
    surface('Sculpted_side_panels',flank,260,22,'Paint')
    # Recessed wheel housings and rolled fender edges.
    for axle in [FRONT,REAR]:
        surface('Rolled_fender',lambda u,t,s=s,axle=axle:(s*(width(axle+cos(-.38+u*(pi+.76))*(.347+.014*t))-.008*t),R+sin(-.38+u*(pi+.76))*(.347+.014*t),axle+cos(-.38+u*(pi+.76))*(.347+.014*t)),72,4,'Paint')
        surface('Wheel_well',lambda u,t,s=s,axle=axle:(s*(.926-.23*t),R+sin(u*pi)*.343,axle+cos(u*pi)*.343),64,5,'Rubber')
    # Long concave sill with shaped end plates.
    surface('Rocker_panel',lambda u,t,s=s:(s*(.899+.033*sin(t*pi)),.155+.087*t,-.98+1.98*u),56,8,'Paint')
    path('Side_skirt',[(s*.927,.145,1.05),(s*.951,.141,.62),(s*.946,.141,-.73),(s*.951,.18,-1.04)],.009,'GlossBlack')
    # Crisp, shallow door shut lines anchored to the body surface.
    for coords in [ [(1.015,.94),(.934,.79),(.915,.39),(.85,.235)], [(-.20,.96),(-.24,.79),(-.25,.35),(-.21,.23)], [(-1.31,.97),(-1.39,.89),(-1.26,.74),(-1.07,.58),(-.94,.31),(-.79,.23),(-.21,.23),(.85,.235)]]:
        path('Door_panel_gap',[(s*(side_x(z,y)+.0013),y,z) for z,y in coords],.0015,'Rubber')
    # Pull handles are sculpted shallow shells, not exposed rectangular blocks.
    for z in [-.03,-.99]:
        box('Handle_recess',(s*(width(z)+.001),.831,z),(.010,.036,.154),'GlossBlack',.017)
        o=box('Painted_door_handle',(s*(width(z)+.015),.84,z+.002),(.025,.024,.139),'Paint',.011)
    if s==1:
        pts=[(s*(side_x(-1.77+.095*cos(a),.81+.076*sin(a))+.002),.81+.076*sin(a),-1.77+.095*cos(a)) for a in [i*2*pi/48 for i in range(49)]]
        tube('Fuel_door',pts,.0014,'Rubber')
    # FL5 front fender extraction duct.
    polygon('Fender_exit',[(s*.936,.47,.99),(s*.92,.48,.91),(s*.909,.23,.78),(s*.914,.235,.89)],'GlossBlack',.009)

# Bonnet: curved longitudinal profile and folded creases, with a recessed vent.
def hood(u,t):
    q=2*u-1;x=q*(.84+.056*t)
    z=1.035+(2.245-.20*abs(q)**2-1.035)*t
    y=.975-.107*t-.030*t*t-.012*q*q+.009*exp(-((abs(q)-.67)/.065)**2)
    return x,y,z
surface('Bonnet_skin',hood,90,60,'Paint')
for s in [-1,1]:
    path('Bonnet_shut_line',[hood((1+s*.76)/2,t) for t in [0,.2,.4,.6,.8,1]],.0014,'Rubber')
    surface('Front_fender_crown',lambda u,t,s=s:lerp(hood((1+s*.99)/2,u),(s*width(1.035+u*1.01),shoulder(1.035+u*1.01),1.035+u*1.01),t),55,12,'Paint')
vent=polygon('Bonnet_heat_extractor',[(-.245,.966,1.17),(.245,.966,1.17),(.225,.940,1.49),(-.225,.940,1.49)],'GlossBlack',.013,root,.008)
for z in [1.22,1.265,1.31,1.355,1.40,1.445]:
    y=.966-(z-1.17)*.081
    box('Extractor_louvre',(0,y+.004,z),(.438,.009,.022),'Alloy',.004)

# Curved roof and wraparound glass. Wide C pillars create the FL5 hatch profile.
def roof(u,t):
    q=u*2-1;z=.18-1.24*t
    return q*(.655+.028*sin(t*pi)),1.374+.032*sin(t*pi)-.032*q*q,z
surface('Roof',roof,64,54,'Paint')
def wind(u,t):
    q=2*u-1
    return q*(.811*(1-t)+.646*t),.963+(1.346-.963)*t+.015*(1-q*q)*sin(t*pi),1.057+(.175-1.057)*t+.028*(1-q*q)*(1-t)
surface('Windscreen',wind,54,36,'Glass')
for t in [0,1]:path('Windscreen_frit',[wind(u,t) for u in [i/16 for i in range(17)]],.012,'GlossBlack')
for s in [-1,1]:
    # Window surrounds are ribbon surfaces with a real pillar width.
    outer=[(s*.848,.958,1.071),(s*.753,1.11,.735),(s*.661,1.335,.195),(s*.659,1.363,-.32),(s*.701,1.322,-.92),(s*.842,1.036,-1.78)]
    inner=[(s*.821,.984,.978),(s*.734,1.121,.678),(s*.675,1.316,.15),(s*.677,1.333,-.32),(s*.718,1.292,-.89),(s*.839,1.063,-1.65)]
    oc=curve(outer,12);ic=curve(inner,12)
    verts=oc+ic;n=len(oc)
    mesh('Roof_rail_and_A_pillar',verts,[(i,i+1,n+i+1,n+i) for i in range(n-1)],'Paint')
    path('Window_rubber_top',inner,.007,'GlossBlack')
    path('Window_rubber_belt',[(s*.846,.962,1.015),(s*.866,.968,.18),(s*.869,.978,-.66),(s*.847,1.02,-1.70)],.011,'GlossBlack')
    # Curved side glazing split at the B pillar, rear quarter division.
    window_points=[(s*.826,.98,.956),(s*.678,1.314,.145),(s*.676,1.334,-.32),(s*.719,1.288,-.88),(s*.839,1.063,-1.65),(s*.865,.99,-.65),(s*.863,.979,.18)]
    polygon('Side_glazing',window_points,'Glass',0,bevel=0)
    polygon('B_pillar',[(s*.868,.977,-.185),(s*.87,.98,-.285),(s*.679,1.333,-.30),(s*.676,1.334,-.205)],'GlossBlack',.022)
    polygon('Quarter_window_divider',[(s*.864,.994,-1.03),(s*.861,1.006,-1.09),(s*.728,1.279,-.94),(s*.714,1.296,-.87)],'GlossBlack',.018)
    surface('C_pillar',lambda u,t,s=s:lerp((s*(.691+.162*u),1.34-.32*u,-1.035-.74*u),(s*(.655+.153*u),1.359-.32*u,-1.105-.94*u),t),42,14,'Paint')
    surface('Window_belt_shoulder',lambda u,t,s=s:lerp((s*(.847+.02*sin(u*pi)),.963+.050*u,1.052-2.82*u),(s*width(1.052-2.82*u),shoulder(1.052-2.82*u),1.052-2.82*u),t),70,10,'Paint')
    # Wing mirrors: formed ellipsoidal casing, inner mirror and slim turn signal.
    path('Mirror_stalk',[(s*.854,.974,.844),(s*.938,.976,.806),(s*1.012,1.006,.802)],.019,'GlossBlack')
    o=box('Mirror_housing',(s*1.006,1.039,.802),(.19,.092,.159),'GlossBlack',.044)
    o=box('Mirror_glass',(s*1.016,1.039,.723),(.153,.062,.005),'Chrome',.027)
    path('Mirror_indicator',[(s*.942,1.044,.872),(s*1.016,1.044,.887),(s*1.080,1.043,.846)],.003,'White')

surface('Rear_windscreen',lambda u,t:((2*u-1)*(.65+.157*t),1.355-.309*t+.014*sin(u*pi)*sin(t*pi),-1.075-.916*t),52,28,'Glass')
for j in range(1,10):
    t=j/11;path('Rear_demister',[(q*(.65+.157*t),1.355-.309*t+.016*(1-q*q),-1.077-.916*t) for q in [-.96,-.5,0,.5,.96]],.0006,'Alloy')
surface('Hatch_deck',lambda u,t:((2*u-1)*(.81+.077*t),1.045-.110*t+.019*(1-(2*u-1)**2),-1.989-.234*t),50,18,'Paint')
mesh('Shark_fin',[(-.026,1.374,-.89),(.026,1.374,-.89),(-.023,1.374,-1.07),(.023,1.374,-1.07),(0,1.407,-1.04)],[(0,1,4),(0,4,2),(1,3,4),(2,4,3),(0,2,3,1)],'GlossBlack')

def frontz(x,y):return 2.291-.27*(abs(x)/.945)**2-.035*((y-.45)/.45)**2
def front_poly(name,xy,material,offset=0,thickness=.018):
    return polygon(name,[(x,y,frontz(x,y)+offset) for x,y in xy],material,thickness,bevel=.005)
def front_strip(name,low,high,material):
    surface(name,lambda u,t:(-1+2*u,0,0),1,1,material) if False else None
    surface(name,lambda u,t:(lambda x,y:(x,y,frontz(x,y)))(-.9+1.8*u,low(-.9+1.8*u)*(1-t)+high(-.9+1.8*u)*t),96,10,material)

# Body-coloured bumper forms surrounding actual open, recessed grille sections.
front_strip('Bumper_crossbar',lambda x:.578-.035*(abs(x)/.9)**2,lambda x:.687+.016*(abs(x)/.9)**2,'Paint')
front_strip('Lower_bumper_lip',lambda x:.185+.018*(abs(x)/.9),lambda x:.26+.035*(abs(x)/.9)**2,'Paint')
front_poly('Top_grille_recess',[(-.472,.808),(.472,.808),(.454,.686),(.32,.665),(-.32,.665),(-.454,.686)],'GlossBlack',-.009,.04)
front_poly('Lower_grille_recess',[(-.635,.577),(.635,.577),(.644,.513),(.573,.276),(-.573,.276),(-.644,.513)],'Rubber',-.035,.01)
box('Radiator_shadow',(0,.43,2.02),(1.30,.37,.09),'Rubber',.013)
box('Upper_grille_shadow',(0,.75,2.09),(.95,.15,.06),'Rubber',.01)
surface('Bonnet_front_return',lambda u,t:lerp(hood(u,1),((2*u-1)*.896,.816-.016*abs(2*u-1),frontz((2*u-1)*.896,.816)),t),80,8,'Paint')
for s in [-1,1]:
    # Rounded cheeks, widening smoothly into the front wheel fenders.
    surface('Bumper_cheek',lambda u,t,s=s:(lambda x,y:(s*x,y,frontz(x,y)+.016*sin(u*pi)*sin(t*pi)))(.653+.25*u,.254+.445*t),32,32,'Paint')
    front_poly('Side_air_curtain',[(s*.812,.52),(s*.867,.541),(s*.837,.293),(s*.776,.28)],'GlossBlack',.028,.009)
    # Front corner returns have continuous depth instead of a square end cap.
    surface('Bumper_corner',lambda u,t,s=s:(s*(.903*(1-u)+width(1.95)*u+.008*sin(u*pi)),.244+.456*t,frontz(s*.903,.244+.456*t)*(1-u)+1.95*u),30,22,'Paint')
    lamp=[(.468,.814),(.824,.847),(.916,.805),(.866,.711),(.617,.698),(.500,.736)]
    front_poly('Headlamp_housing',[(s*x,y) for x,y in lamp],'GlossBlack',.008,.025)
    front_poly('Headlamp_lens',[(s*x,y) for x,y in lamp],'Lens',.022,.002)
    path('LED_daytime_signature',[(s*x,y,frontz(s*x,y)+.026) for x,y in [(.483,.809),(.64,.828),(.823,.838),(.894,.804)]],.004,'Headlight')
    for j in range(4):
        x=s*(.535+j*.076);y=.757+j*.002
        front_poly('LED_reflector',[(x-s*.028,y-.024),(x+s*.028,y-.019),(x+s*.025,y+.028),(x-s*.025,y+.027)],'Chrome',.011,.009)
        front_poly('LED_projector',[(x-s*.019,y-.012),(x+s*.020,y-.010),(x+s*.018,y+.015),(x-s*.019,y+.016)],'Headlight',.021,.004)
    front_poly('Indicator_reflector',[(s*.84,.77),(s*.878,.79),(s*.86,.747),(s*.83,.742)],'Amber',.027,.002)
path('Front_splitter',[(-.929,.182,2.02),(-.871,.158,2.16),(-.6,.151,2.271),(0,.147,2.305),(.6,.151,2.271),(.871,.158,2.16),(.929,.182,2.02)],.012,'GlossBlack')

def honeycomb(name,xmin,xmax,ymin,ymax,r,depth,project,material='GlossBlack',inside=lambda x,y:True):
    vs=[];fs=[];row=0;y=ymin
    while y<=ymax:
        x=xmin+(row%2)*1.5*r
        while x<=xmax:
            if inside(x,y):
                base=len(vs)
                for d in [0,depth]:
                    for radius in [r,r*.70]:
                        for k in range(6):
                            a=k*pi/3;vs.append(project(x+radius*cos(a),y+radius*sin(a),d))
                for k in range(6):
                    n=(k+1)%6
                    fs.extend([(base+k,base+n,base+6+n,base+6+k),(base+6+k,base+6+n,base+18+n,base+18+k)])
            x+=3*r
        row+=1;y+=sqrt(3)*r/2
    return mesh(name,vs,fs,material,smooth=False)
honeycomb('Upper_grille_honeycomb',-.44,.44,.703,.788,.016,.013,lambda x,y,d:(x,y,frontz(x,y)+.006-d))
honeycomb('Lower_grille_honeycomb',-.604,.604,.303,.552,.018,.018,lambda x,y,d:(x,y,frontz(x,y)-.017-d),inside=lambda x,y:abs(x)<.54+(y-.30)*.26)

# Rear bumper and separate C-shaped lamp signatures.
def rearz(x,y):return -2.286+.21*(abs(x)/.945)**3+.034*((y-.60)/.5)**2
surface('Rear_bumper',lambda u,t:(lambda x,y:(x,y,rearz(x,y)))(-.9+1.8*u,.267+.557*t),80,30,'Paint')
surface('Tailgate',lambda u,t:(lambda x,y:(x,y,rearz(x,y)+.006))(-.85+1.7*u,.61+.326*t),72,24,'Paint')
for s in [-1,1]:
    surface('Rear_corner',lambda u,t,s=s:(s*(.885+.049*sin(t*pi)),.268+.578*t,rearz(s*.89,.268+.578*t)+.35*u),30,24,'Paint')
    points=[(.37,.907),(.71,.940),(.89,.903),(.84,.804),(.49,.797),(.55,.85)]
    polygon('Tail_lamp_housing',[(s*x,y,rearz(s*x,y)-.012) for x,y in points],'TailLens',.018)
    for pts in [[(.39,.907),(.69,.925),(.842,.892),(.785,.827),(.52,.823)],[ (.48,.882),(.69,.890),(.77,.87)]]:
        path('C_tail_LED',[(s*x,y,rearz(s*x,y)-.029) for x,y in pts],.009,'Taillight')
    path('Wraparound_tail_LED',[(s*.847,.896,-2.136),(s*.926,.91,-1.96),(s*.935,.929,-1.807)],.011,'Taillight')
    polygon('Rear_bumper_vent',[(s*.829,.65,-2.107),(s*.857,.61,-2.118),(s*.879,.357,-2.09),(s*.85,.35,-2.115)],'GlossBlack',.008)
    path('Rear_reflector',[(s*.56,.357,-2.28),(s*.76,.36,-2.20)],.009,'Taillight')
surface('Diffuser',lambda u,t:(-.86+1.72*u,.165+.11*t,-2.255+.24*t+.085*abs(2*u-1)**2),64,10,'GlossBlack')
for x in [-.65,-.43,.43,.65]:polygon('Diffuser_fin',[(x,.12,-2.27),(x,.255,-2.25),(x,.28,-1.9),(x,.18,-1.9)],'GlossBlack',.012)
for x in [-.128,0,.128]:
    r=.061 if x==0 else .049
    lathe('Exhaust_tip',[(-2.19,r),(-2.30,r),(-2.305,r*.94),(-2.304,r*.81),(-2.20,r*.81)],'Chrome',axis='z',p=(x,.259,0),n=48)
    cylinder('Exhaust_dark_interior',(x,.259,-2.206),r*.79,.008,'Rubber','z')

# FL5 wing: curved aerofoil, swan-neck-free narrow cast pylons and end plates.
for s in [-1,1]:
    polygon('Wing_pylon',[(s*.53,1.034,-1.92),(s*.53,1.063,-2.067),(s*.53,1.224,-2.004),(s*.53,1.238,-1.876)],'Alloy',.027)
    polygon('Wing_endplate',[(s*.839,1.205,-1.824),(s*.839,1.242,-1.99),(s*.839,1.285,-2.16),(s*.839,1.335,-2.18),(s*.839,1.294,-1.89)],'GlossBlack',.017)
surface('Rear_wing_top',lambda u,t:((2*u-1)*.839,1.248+.026*sin(t*pi)+.035*(2*u-1)**2-.018*t,-1.82-.33*t),58,18,'GlossBlack')
surface('Rear_wing_bottom',lambda u,t:((2*u-1)*.839,1.24+.004*sin(t*pi)+.035*(2*u-1)**2-.018*t,-1.82-.33*t),58,12,'GlossBlack')

# Lettering is real geometry. Honda badge has a rounded red surround and chrome H.
def text(name,words,p,size,material,rotation=(pi/2,0,0),parent=root,align='CENTER'):
    data=bpy.data.curves.new(name,'FONT');data.body=words;data.size=size;data.align_x=align;data.align_y='CENTER';data.extrude=.00025;data.resolution_u=5
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=v(p);o.rotation_euler=rotation;data.materials.append(M[material]);o.parent=parent
    return o
for front in [True,False]:
    y=.751 if front else .884;z=2.301 if front else -2.312
    box('Red_Honda_badge',(0,y,z),(.079,.063,.007),'Caliper',.012)
    rot=(pi/2,0,0) if front else (pi/2,0,pi)
    text('Honda_H','H',(0,y,z+(.006 if front else -.006)),.059,'Chrome',rot)
    box('Registration_plate',(0,.616 if front else .638,z-.012 if front else z+.012),(.40,.086,.009),'GlossBlack',.004)
    text('Plate_text','CIVIC TYPE R',(0,.616 if front else .638,z+.002 if front else z-.002),.041,'White',rot)
text('Grille_Type','TYPE',(-.278,.744,frontz(-.278,.744)+.022),.022,'Chrome')
text('Grille_R','R',(-.35,.746,frontz(-.35,.746)+.022),.036,'Caliper')
text('Hatch_Civic','C I V I C',(.61,.738,rearz(.61,.738)-.018),.026,'Chrome',(pi/2,0,pi))
text('Hatch_TypeR','TYPE R',(-.61,.737,rearz(-.61,.737)-.018),.027,'Chrome',(pi/2,0,pi))

# Four independently centred wheel rigs. Tyre shoulder curvature and tapered spokes.
for side in [-1,1]:
 for axle,label in [(FRONT,'F'),(REAR,'R')]:
    w=empty('Wheel_'+label+('R' if side<0 else 'L'),(side*.813,R,axle),root);rigs[w.name]=w
    lathe('Tyre_casing',[(-.121,.247),(-.136,.26),(-.136,.287),(-.121,.313),(-.099,.321),(.099,.321),(.121,.313),(.136,.287),(.136,.26),(.121,.247)],'Tyre',w)
    for d in [-.077,-.031,.031,.077]:
        lathe('Tyre_circumferential_groove',[(d-.002,.3212),(d+.002,.3212)],'Rubber',w)
    # Fine directional sipes around the shoulders.
    for k in range(64):
        a=k*2*pi/64
        for s in [-1,1]:
            pts=[(s*d,(.321 if d<.10 else .315)*cos(a+.055*t),(.321 if d<.10 else .315)*sin(a+.055*t)) for t,d in [(0,.085),(.5,.103),(1,.121)]]
            tube('Tyre_sipe',pts,.0008,'Rubber',w,res=1)
    lathe('Wheel_barrel',[(-.12,.238),(.125,.238),(.14,.235),(.14,.226),(.12,.224)],'Alloy',w)
    cylinder('Brake_disc',(side*.069,0,0),.176,.014,'Brake',parent=w,n=72)
    lathe('Disc_machined_ring',[(side*.079,.142),(side*.079,.171)],'Chrome',w)
    for k in range(10):
        a=k*2*pi/10
        # FL5 ten spoke tapered forged design. Offset gives a concave centre.
        verts=[]
        for d,r,half,offset in [(side*.102,.05,.013,0),(side*.134,.222,.009,.023)]:
            for xx in [-.006,.006]:
                for lr in [-1,1]:
                    verts.append((d+xx,r*cos(a)+(lr*half+offset)*sin(a),r*sin(a)-(lr*half+offset)*cos(a)))
        mesh('Forged_spoke',verts,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],'Alloy',w)
    cylinder('Wheel_hub',(side*.12,0,0),.058,.028,'Alloy',parent=w)
    cylinder('Wheel_centre_badge',(side*.139,0,0),.021,.005,'Caliper',parent=w)
    for k in range(5):
        a=k*2*pi/5;cylinder('Wheel_nut',(side*.14,.04*cos(a),.04*sin(a)),.007,.013,'Chrome',parent=w,n=6)
    cal=box('Brembo_caliper',(side*.891,.34,axle+.14),(.064,.169,.081),'Caliper',.021)
    for rr in [.144,.162]:
        for k in range(24):
            a=k*2*pi/24;cylinder('Brake_perforation',(side*.080,rr*cos(a),rr*sin(a)),.002,.001,'Rubber',parent=w,n=6)

# RHD cabin with sculpted dash, honeycomb strip and detailed centre controls.
box('Cabin_floor',(0,.244,-.25),(1.64,.066,2.63),'Carpet',.025)
surface('Dashboard_top',lambda u,t:((2*u-1)*(.797+.033*t),.898+.018*sin(t*pi)-.023*(2*u-1)**2,.487+.51*t),62,20,'Leather')
box('Dashboard_main',(0,.781,.665),(1.63,.235,.40),'Leather',.06)
box('Dashboard_honeycomb_surround',(0,.825,.459),(1.525,.074,.017),'Chrome',.012)
box('Dashboard_honeycomb_dark',(0,.825,.449),(1.503,.060,.019),'GlossBlack',.01)
honeycomb('Dashboard_honeycomb',-.739,.739,.805,.846,.0044,.005,lambda x,y,d:(x,y,.435+d),'Chrome')
for x in [-.70,-.255,.25,.7]:
    box('Vent_joystick',(x,.825,.424),(.01,.027,.008),'Chrome',.003)
    box('Vent_slider',(x,.82,.419),(.023,.008,.008),'GlossBlack',.003)
path('Dashboard_bottom_trim',[(-.755,.761,.455),(-.26,.765,.444),(0,.744,.434),(.26,.765,.444),(.755,.761,.455)],.0025,'Chrome')
box('Glovebox',(.493,.638,.489),(.51,.165,.054),'Leather',.014)
box('Glovebox_handle',(.493,.691,.457),(.085,.014,.012),'GlossBlack',.005)
text('Passenger_dash_badge','TYPE R',(.47,.825,.424),.017,'Caliper',(pi/2,0,pi))
box('Centre_climate_panel',(0,.724,.413),(.377,.078,.08),'GlossBlack',.025)
for x in [-.133,0,.133]:
    cylinder('Climate_knob',(x,.733,.365),.021,.019,'Chrome','z',n=40)
    cylinder('Climate_knob_face',(x,.733,.353),.018,.005,'GlossBlack','z',n=40)
    text('Temperature','22.0' if x else 'AUTO',(x,.733,.347),.008,'White',(pi/2,0,pi))
for x in [-.075,-.028,.028,.075]:box('Climate_button',(x,.699,.367),(.033,.013,.009),'GlossBlack',.003)
box('Hazard_button',(-.13,.826,.423),(.021,.021,.009),'GlossBlack',.004)
text('Hazard_symbol','△',(-.13,.826,.416),.013,'Caliper',(pi/2,0,pi))
box('Infotainment_casing',(0,1.013,.678),(.249,.158,.020),'GlossBlack',.01)
polygon('Infotainment_screen',[(-.112,.947,.665),(.112,.947,.665),(.112,1.078,.665),(-.112,1.078,.665)],'Screen',0,bevel=0)
box('Infotainment_stand',(0,.920,.685),(.12,.04,.03),'GlossBlack',.005)
box('Instrument_binnacle',(-.43,.93,.706),(.345,.155,.196),'Leather',.036)
polygon('Instrument_screen',[(-.591,.899,.598),(-.269,.899,.598),(-.269,1.006,.598),(-.591,1.006,.598)],'Screen',0,bevel=0)
box('Centre_tunnel',(0,.49,-.12),(.291,.37,.88),'Leather',.048)
box('Console_satin_surround',(0,.658,.01),(.264,.018,.53),'Alloy',.026)
box('Gear_gaiter',(0,.679,.17),(.111,.025,.15),'Leather',.02)
path('Gear_boot_stitch',[(-.038,.696,.12),(-.023,.722,.17),(0,.744,.181),(.03,.696,.215)],.001,'Stitch')
cylinder('Gear_stick',(0,.732,.17),.010,.084,'Chrome','y')
o=box('Aluminium_shift_knob',(0,.786,.17),(.046,.071,.04),'Chrome',.02)
for z in [-.105,-.213]:
    cylinder('Cup_holder_hole',(0,.672,z),.046,.006,'Rubber','y')
    lathe('Cupholder_trim',[(.0,.042),(.007,.043)],'Chrome',axis='z') if False else None
box('Centre_armrest',(0,.642,-.415),(.27,.093,.30),'Leather',.027)
for z in [.158,.095,.038]:box('Drive_mode_switch',(-.091,.676,z),(.045,.012,.037),'GlossBlack',.005)

# Red integrated-headrest bucket seats, built as contoured upholstered surfaces.
for x in [-.432,.432]:
    def back(u,t,x=x):
        q=2*u-1
        half=.204+.025*sin(t*pi)-.078*max(0,(t-.70)/.30)
        y=.475+.70*t
        z=-.555-.13*t+.081*abs(q)**2+.035*exp(-((t-.73)/.17)**2)*abs(q)
        return x+q*half,y,z
    surface('Red_bucket_backrest',back,36,46,'Suede')
    surface('Bucket_rear_shell',lambda u,t:tuple(a+b for a,b in zip(back(u,t),(0,0,-.055))),36,40,'SeatShell')
    for s in [-1,1]:
        surface('Seat_side_bolster',lambda u,t,s=s,x=x:(x+s*(.15+.077*sin(u*pi)),.53+.45*t,-.515-.13*t+.070*sin(u*pi)),20,30,'Suede')
        path('Seat_seam',[back((1+s*.7)/2,t) for t in [0,.2,.4,.6,.8,.96]],.0013,'Stitch')
    surface('Seat_cushion',lambda u,t,x=x:(x+(u*2-1)*.217,.403+.075*abs(u*2-1)**3+.018*sin(t*pi),-.565+.51*t),32,32,'Suede')
    box('Seat_base',(x,.362,-.31),(.447,.089,.489),'SeatShell',.04)
    for s in [-1,1]:
        box('Harness_pass_through',(x+s*.076,1.055,-.65),(.058,.029,.018),'GlossBlack',.011)
    text('Seat_TypeR','TYPE R',(x,.992,-.625),.026,'White')
    box('Seatbelt_buckle',(x+(.263 if x<0 else -.263),.438,-.45),(.035,.058,.045),'GlossBlack',.008)
    box('Buckle_release',(x+(.263 if x<0 else -.263),.47,-.45),(.024,.008,.028),'Caliper',.003)
box('Rear_seat_base',(0,.424,-1.13),(1.41,.16,.48),'Leather',.072)
box('Rear_backrest',(0,.715,-1.427),(1.42,.44,.17),'Leather',.065)
for x in [-.46,.46]:box('Rear_headrest',(x,.996,-1.43),(.22,.145,.12),'Leather',.043)
for s in [-1,1]:
    box('Door_card',(s*.822,.689,.16),(.064,.38,.98),'Leather',.038)
    box('Door_armrest',(s*.785,.65,.06),(.075,.074,.48),'Leather',.033)
    polygon('Door_handle_surround',[(s*.781,.812,.48),(s*.781,.825,.32),(s*.781,.75,.34),(s*.781,.751,.46)],'Chrome',.009)
    box('Door_handle_inset',(s*.774,.783,.402),(.012,.039,.092),'GlossBlack',.012)
    for z in [.16,.205,.25,.295]:box('Window_switch',(s*.737,.688,z),(.021,.008,.028),'GlossBlack',.003)
    cylinder('Door_speaker',(s*.784,.493,.465),.074,.004,'GlossBlack','x')
    path('Interior_A_pillar',[(s*.78,.939,.982),(s*.731,1.11,.719),(s*.655,1.331,.19)],.021,'Leather')
    path('Seatbelt',[(s*.803,1.208,-.25),(s*.76,.801,-.31),(s*.761,.398,-.48)],.012,'Rubber')
    box('Sun_visor',(s*.377,1.288,.16),(.36,.035,.137),'Leather',.016)
box('Headliner',(0,1.361,-.41),(1.19,.017,1.03),'Leather',.029)
box('Rear_view_mirror',(0,1.221,.486),(.224,.061,.025),'GlossBlack',.015)
box('Mirror_reflective_face',(0,1.221,.471),(.207,.045,.003),'Chrome',.01)
path('Mirror_mount',[(0,1.267,.48),(0,1.317,.35)],.012,'GlossBlack')

steer=empty('Steering',(-.43,.895,.365),root);rigs[steer.name]=steer
lathe('Alcantara_steering_rim',[(.0,.145),(.012,.153),(.017,.166),(.0,.18),(-.014,.174),(-.02,.155),(.0,.145)],'Leather',steer,axis='z',n=96)
box('Steering_airbag',(0,-.007,-.016),(.125,.099,.045),'Leather',.026,steer)
for s in [-1,1]:
    polygon('Steering_spoke',[(s*.056,.027,-.010),(s*.151,.034,-.002),(s*.145,-.027,-.010),(s*.05,-.024,-.020)],'Alloy',.012,steer)
    box('Steering_switch_pad',(s*.093,.003,-.027),(.048,.045,.008),'GlossBlack',.007,steer)
    for y in [-.011,.011]:box('Steering_button',(s*.094,y,-.033),(.029,.008,.005),'Leather',.002,steer)
polygon('Lower_steering_spoke',[(-.046,-.04,-.011),(-.036,-.145,-.008),(.036,-.145,-.008),(.046,-.04,-.011)],'Alloy',.01,steer)
box('Steering_red_badge',(0,.011,-.043),(.032,.034,.004),'Caliper',.006,steer)
text('Steering_H','H',(0,.011,-.047),.03,'Chrome',(pi/2,0,pi),steer)
for x in [-.58,-.445,-.319]:
    box('Sport_pedal',(x,.372,.83),(.068,.104,.015),'Chrome',.008)
    for y in [.34,.365,.39]:box('Pedal_grip',(x,y,.819),(.05,.008,.007),'Rubber',.002)
box('Start_button_surround',(-.226,.812,.479),(.042,.042,.023),'GlossBlack',.014)
cylinder('Start_button',(-.226,.812,.46),.014,.008,'Caliper','z')

# Windscreen wipers are separate rigs with pivots aligned to the screen plane.
for x,label in [(-.39,'R'),(.34,'L')]:
    pivot=empty('Wiper_'+label,(x,.970,1.050),root)
    # glTF rotation is supplied in JS around the plane normal.
    pivot.rotation_euler[0]=-math.atan2(.882,.383)
    path('Wiper_arm',[(0,0,0),(0,.18,0),(.008,.37,.004)],.0035,'GlossBlack',pivot)
    path('Wiper_blade',[(.008,.17,.007),(.008,.38,.01),(.008,.57,.006)],.005,'Rubber',pivot)
    rigs[pivot.name]=pivot

# Freeze modifiers and merge static meshes by material, keeping the rig objects.
for o in list(bpy.context.scene.objects):
    if o.type in {'CURVE','FONT'}:
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');o.select_set(False)
for parent in [root]+list(rigs.values())+[o for o in bpy.context.scene.objects if o.name.startswith('Wiper_') and o.type=='EMPTY']:
    batches={}
    for o in list(parent.children):
        if o.type=='MESH' and o.name not in ['Windscreen','Infotainment_screen','Instrument_screen']:
            key=o.data.materials[0].name;batches.setdefault(key,[]).append(o)
    for key,objects in batches.items():
        if len(objects)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name=parent.name+'_'+key
        objects[0].select_set(False)

bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,'civic-type-r-fl5.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'civic-type-r-fl5.glb'),export_format='GLB',export_yup=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6)
stats={'meshObjects':sum(o.type=='MESH' for o in bpy.context.scene.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'),'source':'Original Blender geometry from photographic references. Not manufacturer CAD.','lengthMetres':4.593,'wheelbaseMetres':2.735}
with open(os.path.join(OUT,'model-info.json'),'w') as f:json.dump(stats,f,indent=2)
print('CIVIC_EXPORT',json.dumps(stats))

# Studio preview is separate from the exported asset and editable source.
floor=box('Preview_floor',(0,-.035,0),(200,.05,200),'Leather',0,parent=None)
floor.data.materials.clear();floor.data.materials.append(mat('Studio_floor',(.075,.082,.095),.32,.15))
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.2,.23,.29,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35
def light(name,p,power,size,target=(0,.7,0)):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='RECTANGLE';d.size=size;d.size_y=size*.4
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=v(p);o.rotation_euler=(v(target)-o.location).to_track_quat('-Z','Y').to_euler()
light('Key_strip',(-3,5,3),1400,6);light('Rim_strip',(3,4,-2),1700,5);light('Front_fill',(0,2,5),450,3)
camera_data=bpy.data.cameras.new('Preview_camera');camera=bpy.data.objects.new('Preview_camera',camera_data);bpy.context.collection.objects.link(camera)
camera.location=v((5.1,2.3,6.2));camera.rotation_euler=(v((0,.7,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.lens=52
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1400;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(ROOT,'.shots/civic-assets/blender-front.png')
bpy.ops.render.render(write_still=True)
