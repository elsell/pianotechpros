import XCTest

final class ProfileInteractionTests: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "com.pianotechpros.pianotechpros")
    override func setUpWithError() throws {
        continueAfterFailure = false
        if #available(iOS 16.4, *) {
            app.open(URL(string: "exp+pianotechpros://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A18081")!)
        } else {
            XCTFail("The interaction gate requires iOS 16.4 or newer")
        }
    }
    func dismissDevelopmentOverlay() {
        let tutorial = app.staticTexts["This is the developer menu. It gives you access to useful tools in development builds."]
        if tutorial.waitForExistence(timeout: 5) {
            let next = app.buttons["Continue"].firstMatch
            let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in next.isHittable }, object: next)
            XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 5), .completed)
            next.tap()
        }
        let menu = app.buttons["Source code explorer"].firstMatch
        if menu.exists {
            let close = app.buttons["Close"].firstMatch
            let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in close.isHittable }, object: close)
            XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 5), .completed)
            close.tap()
        }
    }
    func button(_ name: String) -> XCUIElement { app.buttons[name].firstMatch }
    func reach(_ element: XCUIElement) {
        for _ in 0..<10 {
            if element.exists && element.isHittable { return }
            app.swipeUp()
        }
        XCTAssertTrue(element.exists && element.isHittable, "Control must be reachable")
    }
    func tap(_ name: String) { let element = button(name); reach(element); element.tap() }
    func selectChoice(_ name: String, role: String) {
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = "choice-\(name)-before"; tree.lifetime = .keepAlways; add(tree)
        let predicate = NSPredicate(format: "label == %@ AND (value == %@ OR value == %@)",
                                    name, "\(role), checked", "\(role), unchecked")
        let option = app.descendants(matching: .any).matching(predicate).firstMatch
        reach(option); option.tap()
        if role == "checkbox" {
            let checked = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "value == %@", "checkbox, checked"), object: option)
            XCTAssertEqual(XCTWaiter.wait(for: [checked], timeout: 5), .completed)
        }
    }
    func enter(_ label: String, _ value: String) {
        let field = app.textFields[label].firstMatch
        reach(field); field.tap(); field.typeText(value)
        if button("Done").exists && button("Done").isHittable { button("Done").tap() }
    }
    func replace(_ label: String, _ value: String) {
        let field = app.textFields[label].firstMatch
        reach(field); field.tap()
        let previous = field.value as? String ?? ""
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.count) + value)
        if button("Done").exists && button("Done").isHittable { button("Done").tap() }
    }
    func back() {
        let control = app.navigationBars.buttons.element(boundBy: 0)
        XCTAssertTrue(control.waitForExistence(timeout: 10)); control.tap()
    }
    func saved() {
        for _ in 0..<8 {
            if app.staticTexts["Your profile is up to date."].exists { break }
            app.swipeDown()
        }
        XCTAssertTrue(app.staticTexts["Your profile is up to date."].waitForExistence(timeout: 15))
    }
    func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    func testCreateProfilesAndProtectPartialDraft() throws {
        let signIn = button("Sign in")
        XCTAssertTrue(signIn.waitForExistence(timeout: 90))
        dismissDevelopmentOverlay()
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in signIn.isEnabled }, object: signIn)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed); signIn.tap()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let identity = NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", "127.0.0.1", "Sign In")
        let appConsent = app.alerts.containing(identity).firstMatch.buttons["Continue"]
        let systemConsent = springboard.alerts.containing(identity).firstMatch.buttons["Continue"]
        let consentReady = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            (appConsent.exists && appConsent.isHittable) || (systemConsent.exists && systemConsent.isHittable)
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [consentReady], timeout: 30), .completed)
        if appConsent.exists && appConsent.isHittable { appConsent.tap() }
        else { systemConsent.tap() }
        XCTAssertTrue(button("My customer profile").waitForExistence(timeout: 45))
        tap("My customer profile"); enter("Name", "iOS Customer"); enter("Email", "customer@example.test")
        tap("Add location"); enter("Location name", "Home"); enter("Street address", "1 Test Street")
        enter("City", "Boston"); enter("State or region", "MA"); enter("Postal code", "02110")
        tap("Timezone"); selectChoice("UTC", role: "radio button"); tap("Save profile"); saved(); capture("customer-saved")
        back(); back()
        tap("Technician profile"); tap("Contact details"); enter("Name", "iOS Technician"); enter("Email", "technician@example.test")
        back(); tap("Service area"); enter("Location label", "Workshop"); enter("Street address", "2 Test Street")
        enter("City", "Boston"); enter("State or region", "MA"); enter("Postal code", "02110")
        tap("Time zone"); selectChoice("UTC", role: "radio button"); enter("Service radius (miles)", "25")
        back(); tap("Work preferences"); tap("Services offered"); selectChoice("Tuning", role: "checkbox"); tap("Done")
        tap("Piano types serviced"); selectChoice("Grand", role: "checkbox"); tap("Done"); back(); tap("Save profile"); saved(); capture("technician-saved")
        tap("Weekly availability"); tap("Add a weekday"); replace("Start time", "09:")
        for _ in 0..<6 { app.swipeDown() }
        XCTAssertTrue(app.staticTexts["Changes protected on this device. Save to update your profile."].waitForExistence(timeout: 15))
        capture("technician-partial-draft")
    }
    func testRestorePartialDraftAfterProcessRestart() throws {
        XCTAssertTrue(button("Technician profile").waitForExistence(timeout: 60))
        dismissDevelopmentOverlay()
        tap("My customer profile")
        XCTAssertEqual(app.textFields["Name"].firstMatch.value as? String, "iOS Customer")
        back()
        tap("Technician profile"); tap("Weekly availability"); tap("Monday")
        let start = app.textFields["Start time"].firstMatch; reach(start)
        XCTAssertEqual(start.value as? String, "09:")
        capture("technician-restored-partial-draft")
        tap("Save profile")
        XCTAssertTrue(app.staticTexts["Check this value."].waitForExistence(timeout: 10))
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(start.isHittable)
        capture("technician-invalid-time-focus")
    }
}
