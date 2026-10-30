import XCTest

final class ProfileInteractionTests: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "com.pianotechpros.pianotechpros")
    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15))
    }
    func button(_ name: String) -> XCUIElement { app.buttons[name].firstMatch }
    func reach(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 15), "Control must appear before scrolling")
        for _ in 0..<10 {
            if element.exists && element.isHittable { return }
            app.swipeUp()
        }
        capture("unreachable-control")
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = "unreachable-control-tree"; tree.lifetime = .keepAlways; add(tree)
        XCTAssertTrue(element.exists && element.isHittable, "Control must be reachable")
    }
    func tap(_ name: String) { let element = button(name); reach(element); element.tap() }
    func choice(_ name: String, role: String) -> XCUIElement {
        let predicate = NSPredicate(format: "label == %@ AND (value == %@ OR value == %@)",
                                    name, "\(role), checked", "\(role), unchecked")
        return app.descendants(matching: .any).matching(predicate).firstMatch
    }
    func selectChoice(_ name: String, role: String) {
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = "choice-\(name)-before"; tree.lifetime = .keepAlways; add(tree)
        let option = choice(name, role: role)
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
        exactText(field, value, label)
        if button("Done").exists && button("Done").isHittable { button("Done").tap() }
        exactText(field, value, label)
    }
    func replace(_ label: String, _ value: String) {
        let field = app.textFields[label].firstMatch
        reach(field); field.tap()
        let previous = field.value as? String ?? ""
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.count) + value)
        exactText(field, value, label)
        if button("Done").exists && button("Done").isHittable { button("Done").tap() }
        exactText(field, value, label)
    }
    func exactText(_ field: XCUIElement, _ expected: String, _ label: String) {
        let actual = field.value as? String
        if actual != expected {
            capture("incorrect-entry-\(label)")
            let tree = XCTAttachment(string: app.debugDescription)
            tree.name = "incorrect-entry-\(label)-tree"
            tree.lifetime = .keepAlways; add(tree)
        }
        XCTAssertEqual(actual, expected, "Native entry must retain every character in \(label)")
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
    func auditAccessibility(_ name: String) throws {
        capture("accessibility-" + name)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = "accessibility-" + name + "-tree"
        tree.lifetime = .keepAlways
        add(tree)
        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit(for: .all)
        } else {
            XCTFail("Accessibility acceptance requires iOS 17 or later")
        }
    }
    func testPublicAccessibility() throws {
        XCTAssertTrue(button("Showrooms").waitForExistence(timeout: 60))
        try auditAccessibility("home")
        tap("Showrooms")
        XCTAssertTrue(button("Native Empty Showroom").waitForExistence(timeout: 15))
        try auditAccessibility("directory")
        tap("Native Empty Showroom")
        XCTAssertTrue(app.staticTexts["No pianos match these filters."].waitForExistence(timeout: 15))
        try auditAccessibility("empty-catalog")
        tap("About this showroom")
        XCTAssertTrue(app.staticTexts["Please arrange a visit before travelling."].waitForExistence(timeout: 15))
        try auditAccessibility("visit-top")
        reach(app.staticTexts["Tuning is available by appointment."])
        try auditAccessibility("visit-bottom")
        back(); back(); tap("Native Public Showroom")
        XCTAssertTrue(inventoryRow("Native Public Grand").waitForExistence(timeout: 15))
        try auditAccessibility("catalog")
        inventoryRow("Native Public Grand").tap()
        XCTAssertTrue(app.staticTexts["Native Public Grand"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.images["Synthetic public piano photo"].waitForExistence(timeout: 15))
        try auditAccessibility("listing-top")
        tap("Ask about this piano")
        XCTAssertTrue(app.staticTexts["Native Public Grand"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.textFields["Your name"].waitForExistence(timeout: 15))
        try auditAccessibility("buyer-top")
        reach(button("Send inquiry"))
        try auditAccessibility("buyer-bottom")
        back(); back(); back(); back()
        XCTAssertTrue(button("Showrooms").waitForExistence(timeout: 15))
    }

    func testBrowsePublicShowroomWithoutSigningIn() throws {
        XCTAssertTrue(button("Showrooms").waitForExistence(timeout: 60))
        tap("Showrooms"); tap("Native Empty Showroom")
        XCTAssertTrue(app.staticTexts["No pianos match these filters."].waitForExistence(timeout: 15))
        XCTAssertFalse(button("Refine your search").exists)
        XCTAssertFalse(app.textFields["Search pianos"].exists)
        tap("About this showroom")
        XCTAssertTrue(app.staticTexts["Please arrange a visit before travelling."].waitForExistence(timeout: 15))
        reach(app.staticTexts["Ask about regional delivery."])
        reach(app.staticTexts["Warranty details are available before purchase."])
        reach(app.staticTexts["Tuning is available by appointment."])
        capture("public-empty-showroom-visit")
        back(); tap("Include sold pianos")
        XCTAssertTrue(button("Refine your search").waitForExistence(timeout: 15))
        back(); tap("Native Public Showroom")
        XCTAssertTrue(inventoryRow("Native Public Grand").waitForExistence(timeout: 15))
        let search = app.textFields["Search pianos"].firstMatch
        reach(search); search.tap(); search.typeText("UI-PUBLIC-3\n")
        exactText(search, "UI-PUBLIC-3", "public search")
        XCTAssertTrue(app.staticTexts["No pianos match these filters."].waitForExistence(timeout: 15))
        tap("Refine your search"); tap("Availability")
        selectChoice("Sold", role: "radio button"); tap("Show pianos")
        XCTAssertTrue(inventoryRow("Native Public sold").waitForExistence(timeout: 15))
        XCTAssertFalse(inventoryRow("Native Public Grand").exists)
        inventoryRow("Native Public sold").tap()
        XCTAssertTrue(app.staticTexts["Native Public sold"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.images["Synthetic public piano photo"].waitForExistence(timeout: 15))
        capture("public-listing-signed-out")
        tap("Ask about this piano")
        XCTAssertTrue(app.staticTexts["Native Public sold"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Native Public Showroom"].exists)
        capture("public-inquiry-listing-context")
        tap("Send inquiry")
        XCTAssertTrue(app.staticTexts["Check the highlighted fields."].waitForExistence(timeout: 10))
        enter("Your name", "Native Buyer")
        enter("Email address", "native-buyer@example.test")
        let message = app.textViews["Your message"].firstMatch
        reach(message); message.tap(); message.typeText("Please arrange a visit.")
        exactText(message, "Please arrange a visit.", "buyer message")
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.staticTexts["Native Public sold"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Native Public Showroom"].exists)
        exactText(app.textFields["Your name"].firstMatch, "Native Buyer", "buyer name after foreground")
        exactText(message, "Please arrange a visit.", "buyer message after foreground")
        tap("Send inquiry")
        XCTAssertTrue(app.staticTexts["We could not confirm delivery. Please try again later or contact the dealer directly."].waitForExistence(timeout: 15))
        exactText(app.textFields["Your name"].firstMatch, "Native Buyer", "retained buyer name")
        exactText(message, "Please arrange a visit.", "retained buyer message")
        tap("Send inquiry")
        XCTAssertTrue(app.staticTexts["Your inquiry has been received by the dealer."].waitForExistence(timeout: 15))
        XCTAssertFalse(app.textFields["Email address"].exists)
        capture("public-inquiry-confirmed")
        back(); tap("Ask about this piano")
        reach(app.textFields["Your name"].firstMatch)
        exactText(app.textFields["Your name"].firstMatch, "", "cleared buyer name")
        back(); back(); back(); back()
        XCTAssertTrue(button("Sign in").waitForExistence(timeout: 15))
    }

    func testCreateProfilesAndProtectPartialDraft() throws {
        let signIn = button("Sign in")
        XCTAssertTrue(signIn.waitForExistence(timeout: 90))
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
        tap("Add location")
        let locationName = app.textFields["Location name"].firstMatch
        let locationReady = XCTNSPredicateExpectation(
            predicate: NSPredicate { _, _ in locationName.exists && locationName.isHittable }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [locationReady], timeout: 15), .completed,
                       "A new location must open with its first field visible without scrolling")
        enter("Location name", "Home"); enter("Street address", "1 Test Street")
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
        tap("My customer profile")
        XCTAssertEqual(app.textFields["Name"].firstMatch.value as? String, "iOS Customer")
        back()
        tap("Technician profile"); tap("Weekly availability")
        XCTAssertTrue(app.staticTexts["Your protected draft has been restored."].waitForExistence(timeout: 15))
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = "restored-weekday-row"; tree.lifetime = .keepAlways; add(tree)
        let rows = app.buttons.matching(NSPredicate(
            format: "label BEGINSWITH %@ AND label CONTAINS %@", "Monday", "09:"))
        let monday = rows.firstMatch
        reach(monday)
        XCTAssertEqual(rows.count, 1, "The restored Monday schedule must identify one row")
        monday.tap()
        let start = app.textFields["Start time"].firstMatch; reach(start)
        XCTAssertEqual(start.value as? String, "09:")
        capture("technician-restored-partial-draft")
        tap("Save profile")
        XCTAssertTrue(app.staticTexts["Check this value."].waitForExistence(timeout: 10))
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(start.isHittable)
        capture("technician-invalid-time-focus")
    }
    func inventoryRow(_ title: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", title)).firstMatch
    }
    func testIncompletePublicationReturnsToRequiredControls() throws {
        XCTAssertTrue(button("Native UI Shop").waitForExistence(timeout: 60))
        tap("Native UI Shop"); tap("Browse inventory")
        let draft = inventoryRow("UI Draft Piano")
        reach(draft); draft.tap()
        let title = app.textFields["Display title"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 15))
        exactText(title, "UI Draft Piano", "saved draft title")
        tap("Review publication")
        XCTAssertTrue(choice("Grand", role: "radio button").waitForExistence(timeout: 15))
        XCTAssertFalse(button("Confirm change").exists)
        capture("publication-missing-form")
        tap("Done")
        tap("Choose the condition before publishing.")
        XCTAssertTrue(choice("Restored", role: "radio button").waitForExistence(timeout: 15))
        XCTAssertFalse(button("Confirm change").exists)
        capture("publication-missing-condition")
        tap("Done")
        tap("Upload at least one photo before publishing.")
        let photo = button("Choose a photo")
        XCTAssertTrue(photo.waitForExistence(timeout: 15))
        let reachable = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: photo)
        XCTAssertEqual(XCTWaiter.wait(for: [reachable], timeout: 10), .completed,
                       "Missing-photo guidance must return to the photo controls without test scrolling")
        XCTAssertFalse(button("Confirm change").exists)
        capture("publication-missing-photo")
        back(); XCTAssertTrue(inventoryRow("UI Draft Piano").waitForExistence(timeout: 15))
        back(); back()
        XCTAssertTrue(button("My customer profile").waitForExistence(timeout: 15))
    }

    func testBrowseInventoryThroughNormalNavigation() throws {
        XCTAssertTrue(button("Native UI Shop").waitForExistence(timeout: 60))
        tap("Native UI Shop"); tap("Browse inventory")
        XCTAssertTrue(inventoryRow("UI Draft Piano").waitForExistence(timeout: 15))
        XCTAssertFalse(inventoryRow("UI Sold Piano").exists)
        capture("inventory-active")
        tap("Status: Active"); selectChoice("Sold", role: "radio button")
        XCTAssertTrue(inventoryRow("UI Sold Piano").waitForExistence(timeout: 15))
        XCTAssertFalse(inventoryRow("UI Draft Piano").exists)
        let search = app.textFields["Search stock, title, make or model"].firstMatch
        reach(search); search.tap(); search.typeText("UI-002\n")
        exactText(search, "UI-002", "inventory search")
        XCTAssertTrue(app.staticTexts["No pianos match these filters."].waitForExistence(timeout: 15))
        tap("Status: Sold"); selectChoice("Available", role: "radio button")
        XCTAssertTrue(inventoryRow("UI Available Piano").waitForExistence(timeout: 15))
        XCTAssertFalse(inventoryRow("UI Sold Piano").exists)
        XCTAssertEqual(search.value as? String, "UI-002")
        capture("inventory-search-available")
        back(); XCTAssertTrue(button("Browse inventory").waitForExistence(timeout: 10))
        back(); XCTAssertTrue(button("My customer profile").waitForExistence(timeout: 10))
    }

}
