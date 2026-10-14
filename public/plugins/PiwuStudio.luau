--!strict
-- PiwuApp Studio Bridge v1. Install as a LOCAL plugin; never as a game Script.
-- HTTP requests go only to the HTTPS origin you enter. Tokens remain in memory.
-- Does not run imported code, require modules, publish games, or use loadstring.
local Http = game:GetService("HttpService")
local History = game:GetService("ChangeHistoryService")
local Scripts = game:GetService("ScriptEditorService")
local Run = game:GetService("RunService")
local toolbar = plugin:CreateToolbar("PiwuApp")
local toggle = toolbar:CreateButton("PiwuApp Bridge", "Hubungkan project PiwuApp", "")
local widget = plugin:CreateDockWidgetPluginGui("PiwuAppStudioBridgeV1", DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 420, 620, 320, 400))
widget.Title = "PiwuApp · Studio Bridge"
local frame = Instance.new("ScrollingFrame")
frame.Size = UDim2.fromScale(1, 1)
frame.BackgroundColor3 = Color3.fromRGB(27, 34, 39)
frame.BorderSizePixel = 0
frame.AutomaticCanvasSize = Enum.AutomaticSize.Y
frame.CanvasSize = UDim2.new()
frame.ScrollBarThickness = 6
frame.Parent = widget
local padding = Instance.new("UIPadding")
padding.PaddingLeft = UDim.new(0, 14); padding.PaddingRight = UDim.new(0, 14)
padding.PaddingTop = UDim.new(0, 12); padding.PaddingBottom = UDim.new(0, 12); padding.Parent = frame
local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 10); layout.SortOrder = Enum.SortOrder.LayoutOrder; layout.Parent = frame
local order = 0
local function element(className, text, height)
 order += 1
 local e = Instance.new(className)
 e.LayoutOrder = order; e.Size = UDim2.new(1, -4, 0, height)
 e.BackgroundColor3 = Color3.fromRGB(42, 55, 62); e.BorderSizePixel = 0
 e.TextColor3 = Color3.fromRGB(221, 235, 237); e.Font = Enum.Font.SourceSans; e.TextSize = 16
 e.TextWrapped = true; e.Text = text; e.Parent = frame
 return e
end
local note = element("TextLabel", "EDIT MODE · Snapshot lalu review. Tidak ada sinkronisasi atau eksekusi script otomatis. Simpan salinan place sebelum menerapkan perubahan.", 76)
local origin = element("TextBox", "", 40)
origin.PlaceholderText = "https://alamat-piwuapp-anda"; origin.ClearTextOnFocus = false
local tokenInput = element("TextBox", "", 40)
tokenInput.PlaceholderText = "Token pasangan (30 menit, bukan API key Supabase)"; tokenInput.ClearTextOnFocus = false
local connectButton = element("TextButton", "Simpan koneksi di memori", 40)
local sendButton = element("TextButton", "1 · Kirim snapshot ke PiwuApp", 40)
local fetchButton = element("TextButton", "2 · Ambil & tinjau perubahan", 40)
local applyButton = element("TextButton", "3 · Terapkan bundle yang ditinjau", 40)
local clearButton = element("TextButton", "Putuskan & hapus token lokal", 36)
local status = element("TextLabel", "Belum terhubung.", 80)
local review = element("TextBox", "Ringkasan perubahan akan muncul di sini. Baca source script di PiwuApp sebelum mengirim bundle.", 250)
review.MultiLine = true; review.ClearTextOnFocus = false; review.TextEditable = false
review.TextXAlignment = Enum.TextXAlignment.Left; review.TextYAlignment = Enum.TextYAlignment.Top
local address, credential = "", ""
local busy = false
local baseline = nil
local pending = nil
local applied = {}
local confirmUntil = 0
-- User-editable services, NOT CoreGui/CorePackages/engine internals.
local roots = {"Workspace", "ReplicatedFirst", "ReplicatedStorage", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams", "TextChatService", "MaterialService", "LocalizationService"}
local editable = {Folder=true, Model=true, Part=true, Script=true, LocalScript=true, ModuleScript=true}
local scriptClasses = {Script=true, LocalScript=true, ModuleScript=true}
local function request(method, path, body)
 assert(address ~= "" and credential ~= "", "Hubungkan token dan alamat terlebih dahulu.")
 local response = Http:RequestAsync({Url=address .. "/api/studio/" .. path, Method=method, Headers={Authorization="Bearer " .. credential, ["Content-Type"]="application/json"}, Body=body and string.gsub(Http:JSONEncode(body), '"properties":%[%]', '"properties":{}') or nil})
 if not response.Success then
  error("Bridge menolak permintaan (HTTP " .. tostring(response.StatusCode) .. "). Periksa koneksi, masa berlaku token, izin project, atau snapshot yang sudah berubah.")
 end
 return Http:JSONDecode(response.Body)
end
local function action(fn)
 if busy then return end
 busy = true; status.Text = "Memproses…"
 local ok, message = pcall(fn)
 if not ok then status.Text = "Gagal: " .. string.sub(tostring(message), 1, 260) end
 busy = false
end
local function checkEdit()
 assert(not Run:IsRunning(), "Hentikan Play/Run terlebih dahulu. Bridge hanya bekerja dalam Edit Mode.")
end
local function isScript(o) return scriptClasses[o.ClassName] == true end
local function array(v) return {v.X,v.Y,v.Z} end
local function clean(s)
 local text = string.gsub(s, "[^%w_-]", "_")
 return string.sub(text, 1, 35)
end
-- Stable ID attributes are added only when the user explicitly exports a snapshot.
-- Unknown/locked objects get read-only IDs and cannot be modified by this plugin.
local function snapshot(snapshotId, assign)
 checkEdit()
 local result = {version=1, snapshotId=snapshotId, placeId=tostring(game.PlaceId), nodes={}}
 local map, seen = {}, {}
 local scriptCount = 0
 local function visit(o, parentId, path, root)
  assert(#result.nodes < 750, "Place melebihi 750 instance. Snapshot dibatalkan, bukan dipotong.")
  local id = root and ("service:" .. o.ClassName) or o:GetAttribute("PiwuBridgeId")
  if not root and (type(id) ~= "string" or not string.match(id, "^[%w:%.%-_]+$") or #id > 100 or seen[id]) then
   assert(assign, "Instance baru/ID duplikat ditemukan. Ekspor snapshot ulang.")
   id = Http:GenerateGUID(false)
   local canSet = pcall(function() o:SetAttribute("PiwuBridgeId", id) end)
   assert(canSet, "Instance terkunci tidak dapat diidentifikasi dengan aman. Ekspor dibatalkan.")
  end
  assert(not seen[id], "ID duplikat. Ekspor dibatalkan.")
  seen[id] = true; map[id] = o
  local props = {}
  if o.ClassName == "Part" then
   props.position = array(o.Position)
   local x,y,z = o.CFrame:ToEulerAnglesXYZ()
   props.rotation = {math.deg(x),math.deg(y),math.deg(z)}
   props.size = array(o.Size); props.color = "#" .. o.Color:ToHex(); props.anchored = o.Anchored; props.shape = o.Shape.Name
  end
  local node = {id=id,parentId=parentId or "",name=o.Name,className=o.ClassName,properties=props}
  if isScript(o) then
   scriptCount += 1; assert(scriptCount <= 140, "Snapshot melebihi 140 script.")
   local ok, source = pcall(function() return Scripts:GetEditorSource(o) end)
   node.readable = ok
   if ok then
    assert(#source <= 100000, "Source script melebihi 100 KB.")
    local extension = o.ClassName == "Script" and ".server.luau" or o.ClassName == "LocalScript" and ".client.luau" or ".luau"
    node.source = source; node.scriptPath = path .. "/" .. clean(o.Name) .. "_" .. string.sub(id,1,8) .. extension
    assert(#node.scriptPath <= 240, "Path script terlalu panjang.")
   end
  end
  table.insert(result.nodes,node)
  local childPath = root and clean(o.Name) or path .. "/" .. clean(o.Name)
  for _, child in o:GetChildren() do visit(child,id,childPath,false) end
 end
 for _, name in roots do
  local ok, service = pcall(function() return game:GetService(name) end)
  if ok then visit(service,nil,"",true) end
 end
 table.sort(result.nodes,function(a,b) return a.id < b.id end)
 assert(#Http:JSONEncode(result) <= 4000000, "Snapshot melebihi 4 MB.")
 return result,map
end
local function validate(bundle, map)
 assert(type(bundle)=="table" and bundle.version==1 and type(bundle.id)=="string", "Bundle tidak valid.")
 assert(baseline and bundle.baseSnapshotId==baseline.snapshotId and bundle.placeId==tostring(game.PlaceId), "Place atau snapshot tidak cocok.")
 assert(type(bundle.changes)=="table" and #bundle.changes <= 300, "Maksimal 300 operasi per bundle.")
 local known, classes, seen, deleted = {}, {}, {}, {}
 for id,o in map do known[id]=true; classes[id]=o.ClassName end
 for _,c in bundle.changes do
  assert(c.op=="create" or c.op=="update" or c.op=="delete", "Operasi tidak didukung.")
  local id = c.op=="delete" and c.id or c.node.id
  assert(type(id)=="string" and not seen[id], "ID operasi tidak valid/duplikat."); seen[id]=true
  assert(not string.match(id,"^service:"), "Service root tidak boleh diubah.")
  if c.op=="delete" then
   assert(map[id] and editable[map[id].ClassName], "Objek ini tidak boleh dihapus.")
   for _,child in map[id]:GetDescendants() do assert(editable[child.ClassName],"Descendant read-only; penghapusan ditolak.") end
   deleted[id]=true
  else
   local n=c.node
   assert(editable[n.className] and type(n.name)=="string" and #n.name>0 and #n.name<=400,"Class/nama tidak didukung.")
   assert(type(n.parentId)=="string" and n.parentId~="", "Parent diperlukan.")
   if c.op=="create" then assert(not map[id],"ID sudah ada.")
   else assert(map[id] and map[id].ClassName==n.className,"Instance berubah.") end
   if scriptClasses[n.className] then assert(type(n.source)=="string" and #n.source<=100000,"Source tidak valid atau tidak dapat dibaca.") end
   local props=n.properties
   assert(type(props)=="table","Properties diperlukan.")
   for key,value in props do
    assert(key=="position" or key=="rotation" or key=="size" or key=="color" or key=="anchored" or key=="shape","Property tidak didukung.")
    if key=="position" or key=="rotation" or key=="size" then
     assert(type(value)=="table" and #value==3,"Vector harus berisi tiga angka.")
     for _,v in value do assert(type(v)=="number" and v==v and math.abs(v)<=100000,"Angka tidak valid.") if key=="size" then assert(v>=.05 and v<=1000,"Ukuran tidak valid.") end end
    elseif key=="color" then assert(type(value)=="string" and string.match(value,"^#%x%x%x%x%x%x$"),"Warna tidak valid.")
    elseif key=="shape" then assert(value=="Block" or value=="Ball" or value=="Cylinder","Shape tidak valid.")
    elseif key=="anchored" then assert(type(value)=="boolean","Anchored tidak valid.") end
   end
   known[id]=true; classes[id]=n.className
  end
 end
 for _,c in bundle.changes do if c.op~="delete" then assert(known[c.node.parentId] and not deleted[c.node.parentId],"Parent tidak tersedia.") end end
end
local function applyNode(o,n)
 o.Name=n.name
 if o.ClassName=="Part" then
  local p=n.properties
  local position=p.position and Vector3.new(table.unpack(p.position)) or o.Position
  local rx,ry,rz=o.CFrame:ToEulerAnglesXYZ()
  if p.rotation then rx,ry,rz=math.rad(p.rotation[1]),math.rad(p.rotation[2]),math.rad(p.rotation[3]) end
  o.CFrame=CFrame.new(position)*CFrame.Angles(rx,ry,rz)
  if p.size then o.Size=Vector3.new(table.unpack(p.size)) end
  if p.color then o.Color=Color3.fromHex(string.sub(p.color,2)) end
  if p.anchored~=nil then o.Anchored=p.anchored end
  if p.shape then o.Shape=Enum.PartType[p.shape] end
 elseif isScript(o) then
  Scripts:UpdateSourceAsync(o,function() return n.source end)
 end
end
connectButton.MouseButton1Click:Connect(function()
 action(function()
  checkEdit()
  local url=string.gsub(origin.Text,"/+$","")
  assert(string.match(url,"^https://[%w%.%-]+:?%d*$"),"Gunakan origin HTTPS tanpa path, query, atau username.")
  assert(#tokenInput.Text>=32 and #tokenInput.Text<=200,"Token pasangan tidak valid.")
  address=url; credential=tokenInput.Text; tokenInput.Text=""; baseline=nil; pending=nil
  status.Text="Koneksi disimpan hanya di memori. Tujuan: "..address..". Klik Kirim snapshot jika Anda menyetujui unggahan script place ini."
 end)
end)
sendButton.MouseButton1Click:Connect(function()
 action(function()
  local data=snapshot(Http:GenerateGUID(false),true)
  request("POST","snapshot",data)
  baseline=data; pending=nil; confirmUntil=0
  status.Text="Snapshot terkirim: "..tostring(#data.nodes).." instance. Impor snapshot di PiwuApp. Tidak ada script yang dijalankan."
 end)
end)
fetchButton.MouseButton1Click:Connect(function()
 action(function()
  checkEdit(); assert(baseline,"Kirim snapshot dari plugin ini terlebih dahulu.")
  local d=request("GET","pending",nil)
  pending=d.bundle; confirmUntil=0
  if not pending then status.Text="Tidak ada bundle dalam antrean. Status: "..tostring(d.state);return end
  local _,map=snapshot(baseline.snapshotId,false);validate(pending,map)
  local lines={"TINJAU DI PIWUAPP SEBELUM MENERAPKAN:"}
  for _,c in pending.changes do table.insert(lines,c.op.." · "..(c.op=="delete" and c.id or c.node.name.." / "..c.node.className)) end
  review.Text=table.concat(lines,"\n");status.Text=tostring(#pending.changes).." operasi. Tombol Terapkan meminta konfirmasi kedua, termasuk penghapusan."
 end)
end)
applyButton.MouseButton1Click:Connect(function()
 action(function()
  checkEdit();assert(pending and baseline,"Ambil bundle dahulu.");assert(not applied[pending.id],"Bundle ini pernah dicoba. Jangan ulangi; periksa Studio lalu ambil snapshot baru.")
  if os.clock()>confirmUntil then confirmUntil=os.clock()+12;status.Text="KONFIRMASI: "..tostring(#pending.changes).." perubahan termasuk script/penghapusan. Klik Terapkan sekali lagi dalam 12 detik. Simpan backup place dahulu.";return end
  confirmUntil=0
  local current,map=snapshot(baseline.snapshotId,false);validate(pending,map)
  -- Server compares the complete supported snapshot, preventing stale overwrites.
  local recording=History:TryBeginRecording("PiwuStudioBridge","Perubahan PiwuApp")
  assert(recording,"Studio sedang memiliki recording lain. Coba lagi setelah selesai.")
  local claimed,claimError=pcall(function() request("POST","claim",{id=pending.id,snapshot=current}) end)
  if not claimed then History:FinishRecording(recording,Enum.FinishRecordingOperation.Cancel);error(claimError) end
  applied[pending.id]=true
  local ok=pcall(function()
   -- Create unattached objects first, then assign safe parents and properties.
   for _,c in pending.changes do if c.op=="create" then local o=Instance.new(c.node.className);o:SetAttribute("PiwuBridgeId",c.node.id);if o:IsA("BaseScript") then o.Disabled=true end;if o:IsA("BasePart") then o.Anchored=true end;map[c.node.id]=o end end
   for _,c in pending.changes do if c.op~="delete" then map[c.node.id].Parent=map[c.node.parentId];applyNode(map[c.node.id],c.node) end end
   for _,c in pending.changes do if c.op=="delete" then map[c.id]:Destroy() end end
  end)
  -- A partial failure is deliberately NOT called atomic/successful; recording
  -- is committed so the user can undo every mutation that actually happened.
  History:FinishRecording(recording,Enum.FinishRecordingOperation.Commit)
  local ack=pcall(function() request("POST","ack",{id=pending.id,ok=ok}) end)
  pending=nil;baseline=nil
  if not ok then status.Text="PERUBAHAN PARSIAL/GAGAL. Gunakan Undo di Studio dan periksa place sebelum snapshot baru. Tidak akan dicoba ulang otomatis."
  elseif not ack then status.Text="Diterapkan di Studio, receipt gagal dikirim. Jangan ulangi bundle. Cabut/pasangkan ulang bridge setelah memeriksa place."
  else status.Text="Perubahan diterapkan. Script baru tetap Disabled. Review, aktifkan manual, lalu Play Test di Studio. Kirim snapshot baru sebelum perubahan berikutnya." end
 end)
end)
clearButton.MouseButton1Click:Connect(function()
 address="";credential="";tokenInput.Text="";baseline=nil;pending=nil;confirmUntil=0
 status.Text="Token lokal dihapus. Cabut akses juga melalui PiwuApp untuk mencabut token server."
end)
toggle.Click:Connect(function() widget.Enabled=not widget.Enabled end)
plugin.Unloading:Connect(function() credential="";baseline=nil;pending=nil end)
