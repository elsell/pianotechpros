#!/usr/bin/env python3
import unittest
from ci_changes import ALL, Plan, classify, select_diff_range

class Routing(unittest.TestCase):
    def test_known_changes(self):
        self.assertEqual(classify(['docs/mobile.md']), Plan())
        self.assertEqual(classify(['apps/api/internal/app/example/service.go']), Plan(acceptance=True, api_image=True))
        self.assertEqual(classify(['apps/mobile/app/index.tsx']), Plan(native=True))
        self.assertEqual(classify(['packages/client-core/src/index.ts']), Plan(acceptance=True, web_image=True, native=True))
    def test_image_verification_selects_both_images(self):
        for path in ['scripts/verify-docker-builds.sh', 'scripts/test-verify-docker-builds.sh', 'scripts/install-grype.sh', 'scripts/check-node-runtime-security.mjs']:
            with self.subTest(path=path):
                self.assertEqual(classify([path]), Plan(api_image=True, web_image=True))

    def test_native_acceptance_scripts_select_native_gates(self):
        for path in ['scripts/ios-ui-acceptance.sh', 'scripts/ios-journey-schedule.sh',
                     'scripts/ios-journey-schedule.test.mjs', 'scripts/native-real-service-session.mjs',
                     'scripts/seed-native-real-inventory.mjs', 'scripts/check-native-real-inventory.mjs',
                     'scripts/check-native-real-profiles.mjs', 'scripts/install-native-acceptance-services.sh',
                     'scripts/with-native-acceptance-services.sh', 'scripts/check-native-real-lifecycle.mjs',
                     'scripts/ios-ui/ProfileInteractionTests.swift']:
            with self.subTest(path=path):
                self.assertEqual(classify([path]), Plan(native=True))

    def test_authenticated_browser_matrix_selects_real_service_acceptance(self):
        for path in ['scripts/photo-management-persisted-acceptance.mjs', 'scripts/dealer-profile-persisted-acceptance.mjs']:
            with self.subTest(path=path):
                self.assertEqual(classify([path]), Plan(acceptance=True))
    def test_uncertain_changes_run_everything(self):
        for paths in [[], ['new-component/file'], ['/absolute'], ['../escape'], ['docs/readme.md', 'unknown']]:
            with self.subTest(paths=paths): self.assertEqual(classify(paths), ALL)
    def test_release_evidence_is_full(self):
        sha='a'*40; base='b'*40
        self.assertIsNone(select_diff_range('push', 'refs/heads/main', base, '', sha))
        self.assertIsNone(select_diff_range('workflow_dispatch', '', '', '', sha))
        self.assertEqual(select_diff_range('pull_request', '', '', base, sha), f'{base}...{sha}')
        self.assertIsNone(select_diff_range('pull_request', '', '', 'bad', sha))

if __name__ == '__main__': unittest.main()
