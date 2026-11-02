"""Offline orchestration checks; never contact ACME, DNSPod, or a Docker daemon."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


def shell_path(path):
    value = Path(path).resolve().as_posix()
    if os.name == "nt":
        return "/" + value[0].lower() + value[2:]
    return value


ACME_MOCK = """#!/bin/sh
printf 'acme %s\\n' "$*" >> "$TEST_LOG"
case "$1" in
 --issue) exit "${TEST_ISSUE_RC:-0}" ;;
 --install-cert)
  shift
  while [ "$#" -gt 0 ]; do
   case "$1" in
    --key-file) key="$2"; shift 2 ;;
    --fullchain-file) cert="$2"; shift 2 ;;
    --reloadcmd) hook="$2"; shift 2 ;;
    *) shift ;;
   esac
  done
  printf test-key > "$key"
  printf test-cert > "$cert"
  sh -c "$hook"
  ;;
 --cron) exit "${TEST_RENEW_RC:-0}" ;;
 *) exit 99 ;;
esac
"""

DOCKER_MOCK = """#!/bin/sh
printf 'docker %s\\n' "$*" >> "$TEST_LOG"
case "$1" in
 info) exit "${TEST_DOCKER_RC:-0}" ;;
 inspect) printf '%s\\n' "${TEST_NGINX_RUNNING:-true}" ;;
 exec)
  case "$*" in
   *'nginx -t') exit "${TEST_NGINX_INVALID:-0}" ;;
   *'nginx -s reload') exit 0 ;;
   *) exit 98 ;;
  esac ;;
 *) exit 99 ;;
esac
"""


class CertificateContainerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.shell = shutil.which("bash") or shutil.which("sh")
        if not cls.shell:
            # Git for Windows provides a POSIX shell for local validation.
            git = shutil.which("git")
            candidate = Path(git).parent.parent / "bin/bash.exe" if git else None
            if candidate and candidate.is_file():
                cls.shell = str(candidate)
        if not cls.shell:
            raise unittest.SkipTest("A POSIX shell is required")

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="https-container-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.state = self.root / "state"
        self.certs = self.root / "certs"
        self.log = self.root / "commands.log"
        self.script = self.root / "acme-container.sh"
        # Isolate daemon filesystem writes. Production script is otherwise unchanged.
        source = (ROOT / "acme-container.sh").read_text(encoding="utf-8")
        for target in ["/etc/localtime", "/etc/timezone", "/tmp/https.crontab"]:
            source = source.replace(target, shell_path(self.root / Path(target).name))
        self.write(self.script, source)
        self.write(self.bin / "acme.sh", ACME_MOCK)
        self.write(self.bin / "docker", DOCKER_MOCK)
        self.write(self.bin / "supercronic", """#!/bin/sh
printf 'scheduler %s\\n' "$*" >> "$TEST_LOG"
cat "${2:-$1}" >> "$TEST_LOG"
exit 0
""")
        # Only emulates flock dispatch; real process locking is provided by util-linux.
        self.write(self.bin / "flock", """#!/bin/sh
printf 'lock %s\\n' "$*" >> "$TEST_LOG"
[ "${TEST_LOCK_BUSY:-0}" = 0 ] || exit 1
shift 2
exec "$@"
""")
        self.env = os.environ.copy()
        self.env.update({
            "PATH": str(self.bin) + os.pathsep + self.env["PATH"],
            "TEST_LOG": shell_path(self.log),
            "HTTPS_CONFIG_HOME": shell_path(self.state),
            "HTTPS_CERT_DIR": shell_path(self.certs),
            "ACME_EMAIL": "test@example.test",
            "Tencent_SecretId": "test-id",
            "Tencent_SecretKey": "test-secret",
            # Git for Windows may not have the Asia/Shanghai zoneinfo file.
            "TZ": "UTC",
        })

    @staticmethod
    def write(path, text):
        path.write_text(text, encoding="utf-8", newline="\n")
        path.chmod(0o755)

    def run_action(self, action, **env):
        return subprocess.run(
            [self.shell, shell_path(self.script), action],
            env={**self.env, **env}, capture_output=True, text=True, timeout=15,
        )

    def commands(self):
        return self.log.read_text(encoding="utf-8") if self.log.exists() else ""

    def assert_success(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_first_start_issues_installs_then_checks_and_reloads(self):
        self.assert_success(self.run_action("renew"))
        commands = self.commands()
        self.assertIn("--dns dns_tencent", commands)
        self.assertIn("-d daixiaokang.com -d api.daixiaokang.com", commands)
        self.assertLess(commands.index("--issue"), commands.index("--install-cert"))
        self.assertLess(commands.index("nginx -t"), commands.index("nginx -s reload"))
        self.assertTrue((self.state / "https-installed").exists())
        self.assertFalse((self.state / "reload-pending").exists())
        self.assertIn("lock -n", commands)

    def test_issuance_failure_does_not_install_or_reload(self):
        self.assertNotEqual(self.run_action("issue", TEST_ISSUE_RC="1").returncode, 0)
        self.assertNotIn("--install-cert", self.commands())
        self.assertNotIn("docker ", self.commands())
        self.assertFalse((self.state / "https-installed").exists())

    def test_not_due_still_registers_install_hook(self):
        self.assert_success(self.run_action("issue", TEST_ISSUE_RC="2"))
        self.assertIn("--install-cert", self.commands())
        self.assertNotIn("--force", self.commands())

    def test_stopped_nginx_keeps_cert_and_retries_reload(self):
        self.assert_success(self.run_action("issue", TEST_NGINX_RUNNING="false"))
        self.assertTrue((self.certs / "privkey.pem").exists())
        self.assertTrue((self.state / "reload-pending").exists())
        self.log.write_text("", encoding="utf-8")
        self.assert_success(self.run_action("renew"))
        self.assertIn("nginx -s reload", self.commands())
        self.assertIn("--cron", self.commands())
        self.assertNotIn("--issue", self.commands())
        self.assertFalse((self.state / "reload-pending").exists())

    def test_invalid_nginx_does_not_reload_and_keeps_retry_state(self):
        result = self.run_action("issue", TEST_NGINX_INVALID="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("nginx -s reload", self.commands())
        self.assertTrue((self.state / "reload-pending").exists())
        self.assertFalse((self.state / "https-installed").exists())
        self.assert_success(self.run_action("renew"))
        self.assertTrue((self.state / "https-installed").exists())

    def test_unavailable_docker_does_not_silently_skip_reload(self):
        self.assertNotEqual(self.run_action("issue", TEST_DOCKER_RC="1").returncode, 0)
        self.assertTrue((self.state / "reload-pending").exists())
        self.assertNotIn("docker inspect", self.commands())

    def test_missing_credentials_fail_before_external_calls(self):
        self.assertNotEqual(self.run_action("issue", Tencent_SecretKey="").returncode, 0)
        self.assertNotIn("acme ", self.commands())

    def test_busy_lock_prevents_duplicate_issue(self):
        self.assertNotEqual(self.run_action("issue", TEST_LOCK_BUSY="1").returncode, 0)
        self.assertNotIn("acme ", self.commands())

    def test_existing_install_only_runs_renewal_check(self):
        self.assert_success(self.run_action("issue"))
        self.log.write_text("", encoding="utf-8")
        self.assert_success(self.run_action("renew"))
        self.assertIn("--cron", self.commands())
        self.assertNotIn("--issue", self.commands())
        self.assertNotIn("nginx -s reload", self.commands())
        self.assertNotIn("--force", self.commands())

    def test_default_schedule_is_daily_0315_and_survives_issue_failure(self):
        # Isolate zoneinfo read too, without requiring system timezone files.
        source = self.script.read_text(encoding="utf-8")
        zone_dir = self.root / "zones"
        zone_dir.mkdir()
        (zone_dir / "UTC").write_text("mock timezone", encoding="utf-8")
        self.write(self.script, source.replace("/usr/share/zoneinfo", shell_path(zone_dir)))
        self.assert_success(self.run_action("daemon", TEST_ISSUE_RC="1"))
        self.assertIn("15 3 * * *", self.commands())
        self.assertIn("scheduler -test", self.commands())
        self.assertEqual(self.commands().count("scheduler "), 2)


if __name__ == "__main__":
    unittest.main()
