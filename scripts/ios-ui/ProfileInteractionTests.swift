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
            let window = app.windows.firstMatch
            let scroll = app.scrollViews.allElementsBoundByIndex.first {
                $0.exists && $0.isHittable
            }
            var viewport = (scroll?.frame ?? window.frame).intersection(window.frame)
            let keyboard = app.keyboards.firstMatch
            if keyboard.exists {
                // Keep the gesture above both the keyboard and its accessory strip.
                viewport.size.height = max(0, min(viewport.maxY, keyboard.frame.minY - 64) - viewport.minY)
            }
            guard !viewport.isEmpty && viewport.height > 80 else { break }
            let upward = element.frame.midY >= viewport.midY
            let distance = min(viewport.height * 0.55,
                               max(40, abs(element.frame.midY - viewport.midY)))
            let startY = viewport.minY + viewport.height * (upward ? 0.8 : 0.2)
            let origin = window.coordinate(withNormalizedOffset: .zero)
            let start = origin.withOffset(CGVector(dx: viewport.midX - window.frame.minX,
                                                  dy: startY - window.frame.minY))
            let end = origin.withOffset(CGVector(dx: viewport.midX - window.frame.minX,
                                                dy: startY + (upward ? -distance : distance) - window.frame.minY))
            start.press(forDuration: 0.05, thenDragTo: end)
        }
        capture("unreachable-control")
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = "unreachable-control-tree"; tree.lifetime = .keepAlways; add(tree)
        XCTAssertTrue(element.exists && element.isHittable, "Control must be reachable")
    }
    func readVisibleText(_ label: String) {
        let matches = app.staticTexts.matching(NSPredicate(format: "label == %@", label))
        XCTAssertTrue(matches.firstMatch.waitForExistence(timeout: 15))
        let scroll = app.scrollViews.firstMatch
        XCTAssertTrue(scroll.waitForExistence(timeout: 10))
        for _ in 0..<10 {
            let viewport = scroll.frame.intersection(app.windows.firstMatch.frame)
            if !viewport.isEmpty && matches.allElementsBoundByIndex.contains(where: {
                $0.exists && !$0.frame.isEmpty && viewport.contains($0.frame)
            }) { return }
            scroll.swipeUp()
        }
        capture("unreadable-visit-text")
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = "unreadable-visit-text-tree"; tree.lifetime = .keepAlways; add(tree)
        XCTFail("Exact visit text must fit inside the visible scroll viewport: " + label)
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
        readVisibleText("Tuning is available by appointment.")
        try auditAccessibility("visit-bottom")
        back(); back(); tap("Native Public Showroom")
        XCTAssertTrue(inventoryRow("Native Public Grand").waitForExistence(timeout: 15))
        try auditAccessibility("catalog")
        inventoryRow("Native Public Grand").tap()
        XCTAssertTrue(app.staticTexts["Native Public Grand"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.images["Synthetic public piano photo"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Asking price: $1,250.00"].waitForExistence(timeout: 15))
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
        readVisibleText("Ask about regional delivery.")
        readVisibleText("Warranty details are available before purchase.")
        readVisibleText("Tuning is available by appointment.")
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
        tap("Preview photo 1")
        XCTAssertTrue(app.staticTexts["Zoom: 100%"].waitForExistence(timeout: 15))
        tap("Zoom in")
        XCTAssertTrue(app.staticTexts["Zoom: 150%"].waitForExistence(timeout: 10))
        tap("Reset zoom")
        XCTAssertTrue(app.staticTexts["Zoom: 100%"].waitForExistence(timeout: 10))
        capture("public-photo-inspection")
        tap("Close preview")
        XCTAssertTrue(app.staticTexts["Native Public sold"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.images["Synthetic public piano photo"].waitForExistence(timeout: 15))
        tap("Preview photo 1")
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 10))
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
        XCTAssertTrue(button("Preview photo 1").waitForExistence(timeout: 15))
        XCTAssertFalse(button("Close preview").exists)
        capture("public-photo-inspection-background-cleared")
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

    func inventoryMultiline(_ label: String, _ value: String) {
        let field = app.textViews[label].firstMatch
        reach(field); field.tap(); field.typeText(value)
        exactText(field, value, label); tap("Done")
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5),
                      "Done must dismiss the multiline keyboard")
        exactText(field, value, label)
    }
    func setInventorySwitch(_ label: String, enabled: Bool) {
        let control = app.switches[label].firstMatch
        reach(control)
        if (control.value as? String == "1") != enabled { control.tap() }
        XCTAssertEqual(control.value as? String, enabled ? "1" : "0")
    }
    func assertInventoryChoice(_ label: String, _ value: String) {
        tap("Choose " + label)
        let selected = choice(value, role: "radio button")
        XCTAssertTrue(selected.waitForExistence(timeout: 10))
        XCTAssertEqual(selected.value as? String, "radio button, checked")
        tap("Done")
    }
    func testEditInventoryRecord() throws {
        XCTAssertTrue(button("Native UI Shop").waitForExistence(timeout: 60))
        tap("Native UI Shop"); tap("Browse inventory")
        let draft = inventoryRow("UI Draft Piano"); reach(draft); draft.tap()
        replace("Make", "Example"); replace("Model", "Concert")
        replace("Display title", "Edited native piano")
        enter("Size", "180 cm"); enter("Finish", "Satin ebony")
        tap("Choose Piano type"); selectChoice("Grand", role: "radio button")
        tap("Choose Condition"); selectChoice("Restored", role: "radio button")
        setInventorySwitch("Player system", enabled: true)
        enter("Year", "1998"); enter("Month", "6"); enter("Day", "15")
        inventoryMultiline("Public description", "Prepared for a new home.")
        enter("Asking price", "12500.50")
        tap("Choose Price currency"); selectChoice("USD", role: "radio button")
        setInventorySwitch("Show asking price", enabled: true)
        setInventorySwitch("Feature in showroom", enabled: false)
        tap("Internal details")
        replace("Stock number", "UI-EDIT-001"); enter("Serial number", "SN12345")
        enter("Location", "Workshop"); enter("Acquisition cost", "8000.25")
        tap("Choose Cost currency"); selectChoice("USD", role: "radio button")
        inventoryMultiline("Private notes", "Keep this note private.")
        tap("Save now")
        XCTAssertTrue(app.staticTexts["Saved"].waitForExistence(timeout: 20))
        capture("inventory-edited")
        back(); XCTAssertTrue(inventoryRow("Edited native piano").waitForExistence(timeout: 15))
        back(); back()
    }
    func testReopenEditedInventoryAfterProcessRestart() throws {
        XCTAssertTrue(button("Native UI Shop").waitForExistence(timeout: 60))
        tap("Native UI Shop"); tap("Browse inventory")
        let draft = inventoryRow("Edited native piano"); reach(draft); draft.tap()
        for (label, value) in [("Make", "Example"), ("Model", "Concert"),
                               ("Display title", "Edited native piano"), ("Size", "180 cm"), ("Finish", "Satin ebony")] {
            let field = app.textFields[label].firstMatch; reach(field); exactText(field, value, label)
        }
        assertInventoryChoice("Piano type", "Grand"); assertInventoryChoice("Condition", "Restored")
        let player = app.switches["Player system"].firstMatch; reach(player)
        XCTAssertEqual(player.value as? String, "1")
        for (label, value) in [("Year", "1998"), ("Month", "6"), ("Day", "15")] {
            let field = app.textFields[label].firstMatch; reach(field); exactText(field, value, label)
        }
        let description = app.textViews["Public description"].firstMatch; reach(description)
        exactText(description, "Prepared for a new home.", "public description")
        let price = app.textFields["Asking price"].firstMatch; reach(price); exactText(price, "12500.50", "price")
        assertInventoryChoice("Price currency", "USD")
        for (label, value) in [("Show asking price", "1"), ("Feature in showroom", "0")] {
            let control = app.switches[label].firstMatch; reach(control); XCTAssertEqual(control.value as? String, value)
        }
        tap("Internal details")
        for (label, value) in [("Stock number", "UI-EDIT-001"), ("Serial number", "SN12345"),
                               ("Location", "Workshop"), ("Acquisition cost", "8000.25")] {
            let field = app.textFields[label].firstMatch; reach(field); exactText(field, value, label)
        }
        assertInventoryChoice("Cost currency", "USD")
        let notes = app.textViews["Private notes"].firstMatch; reach(notes)
        exactText(notes, "Keep this note private.", "private notes")
        capture("inventory-reopened-after-restart")
        back(); back(); back()
    }

    func chooseAvailability(_ value: String) {
        let controls = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "New availability"))
        let control = controls.firstMatch
        reach(control); XCTAssertEqual(controls.count, 1); control.tap()
        selectChoice(value, role: "radio button")
    }
    func testSellAvailableInventory() throws {
        XCTAssertTrue(button("Native UI Shop").waitForExistence(timeout: 60))
        tap("Native UI Shop"); tap("Browse inventory")
        let piano = inventoryRow("UI Available Piano"); reach(piano); piano.tap()
        tap("Review availability change"); chooseAvailability("Sold")
        let amount = app.textFields["Final sale amount"].firstMatch
        reach(amount); exactText(amount, "1234.56", "sale default")
        replace("Final sale amount", "1100.25")
        tap("Review availability change")
        XCTAssertTrue(app.staticTexts["$1,100.25"].waitForExistence(timeout: 15))
        capture("sale-review"); tap("Confirm change")
        XCTAssertTrue(app.staticTexts["Change confirmed."].waitForExistence(timeout: 20))
        capture("sale-confirmed"); back(); back(); back()
    }
    func testCorrectSoldInventoryAfterRestart() throws {
        XCTAssertTrue(button("Native UI Shop").waitForExistence(timeout: 60))
        tap("Native UI Shop"); tap("Browse inventory")
        tap("Status: Active"); selectChoice("Sold", role: "radio button")
        let piano = inventoryRow("UI Available Piano"); reach(piano); piano.tap()
        tap("Review availability change"); chooseAvailability("Available")
        let reason = app.textViews["Correction reason"].firstMatch
        reach(reason); reason.tap(); reason.typeText("Native iOS correction")
        exactText(reason, "Native iOS correction", "sale correction reason")
        tap("Review availability change")
        XCTAssertTrue(app.staticTexts["Native iOS correction"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.keyboards.firstMatch.exists)
        capture("sale-correction-review"); tap("Confirm change")
        XCTAssertTrue(app.staticTexts["Change confirmed."].waitForExistence(timeout: 20))
        capture("sale-correction-confirmed"); back(); back(); back()
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
