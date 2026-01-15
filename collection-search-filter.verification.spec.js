import { test, expect } from '@playwright/test';

// Verification test for collection-search-filter feature
// Tests search bar and filters on the collections page

test.describe('Collections Search and Filter Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Register and login to get access to collections page
    await page.goto('/register');

    // Generate unique credentials for this test run
    const uniqueId = Date.now();
    const email = `test${uniqueId}@test.com`;
    const password = 'testpassword123';

    // Fill registration form
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL('/', { timeout: 10000 });

    // Navigate to collections page
    await page.goto('/collections');
    await page.waitForSelector('.page-header h1', { timeout: 10000 });
  });

  test('should display search bar and filter buttons', async ({ page }) => {
    // Verify search bar is present
    const searchInput = page.getByTestId('collections-search');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute('placeholder', 'Search collections by name or description...');

    // Verify filter buttons are present
    const sourceTypeFilter = page.getByTestId('source-type-filter');
    await expect(sourceTypeFilter).toBeVisible();
    await expect(sourceTypeFilter).toContainText('Source Type');

    const syncStatusFilter = page.getByTestId('sync-status-filter');
    await expect(syncStatusFilter).toBeVisible();
    await expect(syncStatusFilter).toContainText('Sync Status');
  });

  test('should open and close source type filter dropdown', async ({ page }) => {
    const sourceTypeFilter = page.getByTestId('source-type-filter');

    // Click to open dropdown
    await sourceTypeFilter.click();

    // Verify dropdown menu is visible
    const menu = page.getByTestId('source-type-menu');
    await expect(menu).toBeVisible();

    // Verify all source type options are present
    await expect(menu.getByText('MANUAL')).toBeVisible();
    await expect(menu.getByText('MDBLIST')).toBeVisible();
    await expect(menu.getByText('TRAKT')).toBeVisible();

    // Click again to close
    await sourceTypeFilter.click();
    await expect(menu).not.toBeVisible();
  });

  test('should open and close sync status filter dropdown', async ({ page }) => {
    const syncStatusFilter = page.getByTestId('sync-status-filter');

    // Click to open dropdown
    await syncStatusFilter.click();

    // Verify dropdown menu is visible
    const menu = page.getByTestId('sync-status-menu');
    await expect(menu).toBeVisible();

    // Verify all sync status options are present
    await expect(menu.getByText('Synced')).toBeVisible();
    await expect(menu.getByText('Never Synced')).toBeVisible();

    // Click again to close
    await syncStatusFilter.click();
    await expect(menu).not.toBeVisible();
  });

  test('should show clear button when typing in search', async ({ page }) => {
    const searchInput = page.getByTestId('collections-search');

    // Initially, clear button should not be visible
    let clearButton = page.getByTestId('clear-filters');
    await expect(clearButton).not.toBeVisible();

    // Type in search box
    await searchInput.fill('test search');

    // Clear button should now be visible
    clearButton = page.getByTestId('clear-filters');
    await expect(clearButton).toBeVisible();

    // Click clear button
    await clearButton.click();

    // Search should be cleared
    await expect(searchInput).toHaveValue('');
    await expect(clearButton).not.toBeVisible();
  });

  test('should show clear button when filter is selected', async ({ page }) => {
    // Initially, clear button should not be visible
    let clearButton = page.getByTestId('clear-filters');
    await expect(clearButton).not.toBeVisible();

    // Open source type filter and select MANUAL
    const sourceTypeFilter = page.getByTestId('source-type-filter');
    await sourceTypeFilter.click();

    const menu = page.getByTestId('source-type-menu');
    await menu.locator('label').filter({ hasText: 'MANUAL' }).click();

    // Clear button should now be visible
    clearButton = page.getByTestId('clear-filters');
    await expect(clearButton).toBeVisible();

    // Filter count should be shown
    await expect(sourceTypeFilter.locator('.filter-count')).toContainText('1');
  });

  test('should show empty state with no collections message', async ({ page }) => {
    // With a fresh account, should show empty state
    await expect(page.getByText('No collections yet')).toBeVisible();
  });

  test('should create a manual collection and verify it appears', async ({ page }) => {
    // Click create manual button
    await page.click('button:has-text("Create Manual")');

    // Fill the form
    await page.fill('input[placeholder="My Collection"]', 'Test Collection');
    await page.fill('input[placeholder="Collection description"]', 'A test collection for verification');

    // Submit
    await page.click('button:has-text("Create")');

    // Wait for modal to close and collection to appear
    await expect(page.locator('.collection-card')).toBeVisible({ timeout: 5000 });

    // Verify collection is visible
    await expect(page.getByText('Test Collection')).toBeVisible();
    await expect(page.getByText('A test collection for verification')).toBeVisible();
  });

  test('should filter collections by search query', async ({ page }) => {
    // First create a collection
    await page.click('button:has-text("Create Manual")');
    await page.fill('input[placeholder="My Collection"]', 'Unique Test Collection');
    await page.fill('input[placeholder="Collection description"]', 'For search testing');
    await page.click('button:has-text("Create")');
    await expect(page.locator('.collection-card')).toBeVisible({ timeout: 5000 });

    // Search for the collection
    const searchInput = page.getByTestId('collections-search');
    await searchInput.fill('Unique Test');

    // Wait for debounce
    await page.waitForTimeout(400);

    // Verify filter results count is shown
    const filterResults = page.getByTestId('filter-results');
    await expect(filterResults).toBeVisible();
    await expect(filterResults).toContainText('Showing 1 of 1 collections');

    // Collection should still be visible
    await expect(page.getByText('Unique Test Collection')).toBeVisible();

    // Search for something that doesn't exist
    await searchInput.fill('NonExistentCollection');
    await page.waitForTimeout(400);

    // Should show no results message
    await expect(page.getByText('No collections match your filters')).toBeVisible();
  });

  test('should filter collections by source type', async ({ page }) => {
    // First create a manual collection
    await page.click('button:has-text("Create Manual")');
    await page.fill('input[placeholder="My Collection"]', 'Manual Filter Test');
    await page.click('button:has-text("Create")');
    await expect(page.locator('.collection-card')).toBeVisible({ timeout: 5000 });

    // Apply MDBLIST filter (which should hide the manual collection)
    const sourceTypeFilter = page.getByTestId('source-type-filter');
    await sourceTypeFilter.click();

    const menu = page.getByTestId('source-type-menu');
    await menu.locator('label').filter({ hasText: 'MDBLIST' }).click();

    // Should show no results since we only have a MANUAL collection
    await expect(page.getByText('No collections match your filters')).toBeVisible();

    // Now select MANUAL filter instead
    await menu.locator('label').filter({ hasText: 'MDBLIST' }).click(); // Uncheck MDBLIST
    await menu.locator('label').filter({ hasText: 'MANUAL' }).click(); // Check MANUAL

    // Collection should be visible again
    await expect(page.getByText('Manual Filter Test')).toBeVisible();
  });
});
