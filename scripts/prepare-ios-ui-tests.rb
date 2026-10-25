require 'xcodeproj'
root = File.expand_path('..', __dir__)
project_path = Dir[File.join(root, 'apps/mobile/ios/*.xcodeproj')].first
abort 'Generated iOS project missing' unless project_path
project = Xcodeproj::Project.open(project_path)
app = project.targets.find { |target| target.product_type == 'com.apple.product-type.application' }
abort 'Application target missing' unless app
name = 'PianoInteractionTests'
abort 'UI test target already exists' if project.targets.any? { |target| target.name == name }
target = project.new_target(:ui_test_bundle, name, :ios, '15.1', nil, :swift)
target.add_dependency(app)
target.build_configurations.each do |config|
  config.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.pianotechpros.interaction-tests',
    'GENERATE_INFOPLIST_FILE' => 'YES', 'SWIFT_VERSION' => '5.0',
    'TEST_TARGET_NAME' => app.name, 'CODE_SIGNING_ALLOWED' => 'NO',
    'TARGETED_DEVICE_FAMILY' => '1,2'
  })
end
source = project.main_group.new_file(File.join(root, 'scripts/ios-ui/ProfileInteractionTests.swift'))
target.source_build_phase.add_file_reference(source)
project.root_object.attributes['TargetAttributes'] ||= {}
project.root_object.attributes['TargetAttributes'][target.uuid] = { 'TestTargetID' => app.uuid }
project.save
scheme = Xcodeproj::XCScheme.new
scheme.configure_with_targets(app, target, launch_target: true)
scheme.save_as(project_path, name)
