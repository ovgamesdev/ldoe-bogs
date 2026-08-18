D:\Apps\vips\bin\vips.exe arrayjoin "part_1.png part_2.png part_3.png part_4.png part_5.png part_6.png part_7.png part_8.png part_9.png" large.v --across 3
D:\Apps\vips\bin\vips.exe dzsave "large.v" tiles --layout google --suffix .webp --background "255 255 255 0" --tile-size 512 --skip-blanks 20

# LODы

$vips = "D:\Apps\vips\bin\vips.exe"

Get-ChildItem -Filter *.png | ForEach-Object {
    $file = $_
    $baseName = $file.BaseName
    $in = "${baseName}_resized.v"
    $outDir = "area_${baseName}"

    # Конвертируем PNG в формат .v с сохранением оригинального размера
    & $vips copy $file.FullName $in

    # Создаем папку под LODы
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null

    # Генерируем LODы (lod0..lod7)
    for ($z = 0; $z -le 7; $z++) {
        $scale = [math]::Pow(2, $z - 7)
        & $vips resize $in "$outDir\lod$z.webp" $scale
    }
}