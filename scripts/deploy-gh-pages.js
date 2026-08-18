import { spawnSync } from "child_process"
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "fs"
import { tmpdir } from "os"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = resolve(__dirname, "..");
const OUT_DIR = join(ROOT, "out");
const TEMP_DIR = join(tmpdir(), "ldoe-bogs-gh-pages");

const REMOTE = "origin";
const BRANCH = "gh-pages";

function run(command, args, cwd = ROOT) {
    console.log(`\n> ${command} ${args.join(" ")}`);

    const result = spawnSync(command, args, {
        cwd,
        stdio: "inherit",
        shell: false,
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(
            `Command failed with exit code ${result.status}: ${command}`
        );
    }
}

function runQuiet(command, args, cwd = ROOT) {
    const result = spawnSync(command, args, {
        cwd,
        stdio: "pipe",
        encoding: "utf8",
        shell: false,
    });

    if (result.error) {
        throw result.error;
    }

    return {
        code: result.status,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
    };
}

function removeDirectory(dir) {
    if (existsSync(dir)) {
        console.log(`Удаляю временную папку: ${dir}`);
        rmSync(dir, {
            recursive: true,
            force: true,
        });
    }
}

function copyDirectoryContents(source, destination) {
    mkdirSync(destination, { recursive: true });

    const entries = readdirSync(source, {
        withFileTypes: true,
    });

    for (const entry of entries) {
        const sourcePath = join(source, entry.name);
        const destinationPath = join(destination, entry.name);

        cpSync(sourcePath, destinationPath, {
            recursive: true,
            force: true,
        });
    }
}

function countFiles(dir) {
    let count = 0;

    function walk(current) {
        const entries = readdirSync(current, {
            withFileTypes: true,
        });

        for (const entry of entries) {
            const fullPath = join(current, entry.name);

            if (entry.isDirectory()) {
                walk(fullPath);
            } else {
                count++;
            }
        }
    }

    walk(dir);
    return count;
}

function main() {
    console.log("========================================");
    console.log("       LDOE BOGS — GitHub Pages");
    console.log("========================================");

    // --------------------------------------------------
    // 1. Проверяем Git
    // --------------------------------------------------

    const branchCheck = runQuiet("git", ["branch", "--show-current"]);

    if (branchCheck.stdout !== "main") {
        throw new Error(
            `Текущая ветка не main, а "${branchCheck.stdout}".\n` +
            "Деплой остановлен, чтобы не затронуть исходный код."
        );
    }

    console.log("\n✓ Текущая ветка: main");

    // --------------------------------------------------
    // 2. Проверяем out
    // --------------------------------------------------

    if (!existsSync(OUT_DIR)) {
        throw new Error(
            "Папка out не найдена.\n" +
            "Сначала выполните npm run build."
        );
    }

    const indexPath = join(OUT_DIR, "index.html");

    if (!existsSync(indexPath)) {
        throw new Error(
            "В папке out нет index.html.\n" +
            "Похоже, статический экспорт не был создан."
        );
    }

    const fileCount = countFiles(OUT_DIR);

    console.log(`✓ out найден`);
    console.log(`✓ Файлов для публикации: ${fileCount}`);

    // --------------------------------------------------
    // 3. Проверяем наличие gh-pages на GitHub
    // --------------------------------------------------

    console.log("\nПроверяю ветку gh-pages на GitHub...");

    const remoteBranch = runQuiet("git", [
        "ls-remote",
        "--heads",
        REMOTE,
        BRANCH,
    ]);

    const branchExists = remoteBranch.stdout.length > 0;

    if (branchExists) {
        console.log("✓ Ветка gh-pages уже существует");
    } else {
        console.log("✓ Ветки gh-pages ещё нет — она будет создана");
    }

    // --------------------------------------------------
    // 4. Создаём чистую временную папку
    // --------------------------------------------------

    removeDirectory(TEMP_DIR);

    mkdirSync(TEMP_DIR, {
        recursive: true,
    });

    console.log(`\n✓ Временная папка: ${TEMP_DIR}`);

    // --------------------------------------------------
    // 5. Создаём отдельный Git repository
    // --------------------------------------------------

    run("git", ["init"], TEMP_DIR);

    run(
        "git",
        [
            "remote",
            "add",
            REMOTE,
            "https://github.com/ovgamesdev/ldoe-bogs.git",
        ],
        TEMP_DIR
    );

    // --------------------------------------------------
    // 6. Создаём gh-pages
    // --------------------------------------------------

    run("git", ["switch", "--orphan", BRANCH], TEMP_DIR);

    // --------------------------------------------------
    // 7. Копируем out
    // --------------------------------------------------

    console.log("\nКопирую содержимое out → gh-pages...");

    copyDirectoryContents(OUT_DIR, TEMP_DIR);

    console.log(`✓ Скопировано файлов: ${fileCount}`);

    // --------------------------------------------------
    // 8. Git status
    // --------------------------------------------------

    run("git", ["status", "--short"], TEMP_DIR);

    // --------------------------------------------------
    // 9. Добавляем всё
    // --------------------------------------------------

    console.log("\nДобавляю файлы в Git...");

    run("git", ["add", "-A"], TEMP_DIR);

    // --------------------------------------------------
    // 10. Проверяем есть ли изменения
    // --------------------------------------------------

    const stagedCheck = runQuiet(
        "git",
        ["diff", "--cached", "--quiet"],
        TEMP_DIR
    );

    if (stagedCheck.code === 0) {
        console.log("\n✓ Изменений нет. gh-pages уже актуальна.");
        removeDirectory(TEMP_DIR);
        return;
    }

    // --------------------------------------------------
    // 11. Commit
    // --------------------------------------------------

    console.log("\nСоздаю commit...");

    run(
        "git",
        [
            "-c",
            "user.name=GitHub Pages Deploy",
            "-c",
            "user.email=deploy@localhost",
            "commit",
            "-m",
            "Deploy site",
        ],
        TEMP_DIR
    );

    // --------------------------------------------------
    // 12. Push
    // --------------------------------------------------

    console.log("\nОтправляю сайт в GitHub...");

    run(
        "git",
        [
            "push",
            REMOTE,
            `${BRANCH}:${BRANCH}`,
            "--force",
        ],
        TEMP_DIR
    );

    // --------------------------------------------------
    // 13. Cleanup
    // --------------------------------------------------

    removeDirectory(TEMP_DIR);

    console.log("\n========================================");
    console.log("       ✓ DEPLOY УСПЕШНО ЗАВЕРШЁН");
    console.log("========================================");
    console.log(`Ветка: ${BRANCH}`);
    console.log(`Файлов: ${fileCount}`);
    console.log("Исходный main не изменён.");
}

try {
    main();
} catch (error) {
    console.error("\n========================================");
    console.error("       ✗ DEPLOY ОШИБКА");
    console.error("========================================");
    console.error(error.message);

    try {
        removeDirectory(TEMP_DIR);
    } catch {}

    process.exit(1);
}