/**
 * ELITE CRM - ALL-IN-ONE ARCHITECTURE
 * Structured for local file protocol compatibility
 */

// --- MODULE 1: UTILS ---
const Utils = {
    normalizeDate(dateStr) {
        if (!dateStr) return null;
        if (typeof dateStr === 'number') return this.excelToJSDate(dateStr);
        if (dateStr.includes('/')) {
            const [d, m, y] = dateStr.split('/');
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return dateStr;
    },
    excelToJSDate(serial) {
        const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
    },
    getRemainingDays(expireDate) {
        if (!expireDate) return null;
        let d, m, y;

        if (typeof expireDate === 'string' && expireDate.includes('/')) {
            const parts = expireDate.split('/');
            if (parts.length === 3) {
                [d, m, y] = parts.map(Number);
            }
        } else {
            const dateObj = new Date(expireDate);
            if (!isNaN(dateObj.getTime())) {
                d = dateObj.getDate();
                m = dateObj.getMonth() + 1;
                y = dateObj.getFullYear();
            }
        }

        if (!d || !m || !y) return null;

        const target = new Date(y, m - 1, d);
        target.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diff = target - today;
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    },
    formatDisplayDate(dateStr) {
        if (!dateStr) return '---';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    },
    copyToClipboard(text) {
        const temp = document.createElement('textarea');
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        return true;
    },
    highlightText(text, search) {
        if (!search || !text) return text;
        const regex = new RegExp(`(${search})`, 'gi');
        return String(text).replace(regex, '<span class="search-highlight">$1</span>');
    }
};

// --- MODULE 2: SUPABASE SERVICE ---
const SupabaseService = {
    client: null,
    init(url, key) {
        if (typeof supabase === 'undefined') return null;
        this.client = supabase.createClient(url, key);
        return this.client;
    },
    async fetchData(table) {
        return await this.client.from(table).select('*').order('expire_date', { ascending: true });
    },
    async addCustomer(table, payload) {
        return await this.client.from(table).insert([payload]);
    },
    async updateCustomer(table, id, data) {
        return await this.client.from(table).update(data).eq('id', id);
    },
    async deleteCustomer(table, id) {
        return await this.client.from(table).delete().eq('id', id);
    }
};

// --- MODULE 3: UI COMPONENTS ---
const Components = {
    createCustomerCard(customer, category, onRenew, onDelete) {
        const days = Utils.getRemainingDays(customer.expire_date);
        const expired = days !== null && days < 0;
        const urgent = days !== null && days >= 0 && days <= 7;
        const statusClass = expired ? 'status-err' : (urgent ? 'status-warn' : 'status-ok');
        const badgeText = expired ? 'منتهي' : 'نشط';
        const badgeClass = expired ? 'badge-expired' : 'badge-active';

        const card = document.createElement('div');
        card.className = `c-card ${statusClass}`;
        card.innerHTML = `
            <div class="c-card-header">
                <div style="flex:1">
                    <div class="c-name" onclick="App.copyText('${customer.username}')">${Utils.highlightText(customer.username, App.state.searchQuery)}</div>
                    ${customer.mac_address ? `<div class="c-meta" onclick="App.copyText('${customer.mac_address}')"><span class="meta-label">MAC:</span> ${Utils.highlightText(customer.mac_address, App.state.searchQuery)} 📋</div>` : ''}
                    ${customer.phone_number ? `<div class="c-meta" onclick="App.copyText('${customer.phone_number}')"><span class="meta-label">📞</span> ${Utils.highlightText(customer.phone_number, App.state.searchQuery)} 📋</div>` : ''}
                    ${customer.note ? `<div class="c-meta note-box"><span class="meta-label">📝 ملاحظة:</span> ${customer.note}</div>` : ''}
                    <div class="c-pass" onclick="App.copyText('${customer.password}')">Pass: ${Utils.highlightText(customer.password || '---', App.state.searchQuery)}</div>
                </div>
                <div class="c-header-actions">
                    <span class="c-badge ${badgeClass}">${badgeText}</span>
                    <div class="c-menu-wrapper">
                        <button class="btn-mini btn-gear">⚙️</button>
                        <div class="c-action-menu">
                            <button class="menu-item btn-edit-trigger"><span>✏️</span> تعديل البيانات</button>
                            <button class="menu-item btn-renew-card-trigger"><span>🔄</span> تجديد الاشتراك</button>
                            <button class="menu-item btn-del-trigger danger"><span>🗑️</span> حذف العميل</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Safety Overlay for Actions -->
            <div class="safety-overlay" id="safety-${customer.id}">
                <div class="safety-content">
                    <div class="safety-timer">5</div>
                    <p class="safety-text" id="safety-text-${customer.id}">جاري التنفيذ...</p>
                    <button class="btn-cancel">إلغاء ❌</button>
                </div>
            </div>

            <!-- Success Checkmark Overlay -->
            <div class="success-overlay" id="success-${customer.id}">
                <div class="checkmark-circle">
                    <div class="checkmark draw"></div>
                </div>
                <p>تم بنجاح ✅</p>
            </div>

            <div class="c-progress-info">
                <span>ينتهي في: ${Utils.formatDisplayDate(customer.expire_date)}</span>
                <span style="font-weight:700">${expired ? 'انتهى منذ' : 'متبقي'} ${Math.abs(days)} يوم</span>
            </div>
            <div class="c-progress-bg">
                <div class="c-progress-fill" style="width:${this.calcProgress(days)}%; background:${this.getBarColor(expired, urgent)}"></div>
            </div>
            <div class="c-actions">
                <button class="btn-action btn-wa">واتساب 💬</button>
                <button class="btn-action btn-call" onclick="window.location.href='tel:${customer.username}'">اتصال 📞</button>
            </div>
        `;

        // Toggle Action Menu
        const gear = card.querySelector('.btn-gear');
        const menu = card.querySelector('.c-action-menu');
        gear.onclick = (e) => {
            e.stopPropagation();
            menu.classList.toggle('active');
        };

        // Manage Flow Implementation
        card.querySelector('.btn-edit-trigger').onclick = () => { menu.classList.remove('active'); App.openManageModal(customer); };
        card.querySelector('.btn-renew-card-trigger').onclick = () => { menu.classList.remove('active'); App.openManageModal(customer); }; // Opens modal which has renew options
        card.querySelector('.btn-del-trigger').onclick = () => { menu.classList.remove('active'); App.startSafetyFlow(customer, 'delete'); };

        card.querySelector('.btn-wa').onclick = () => App.openTemplateModal(customer);
        return card;
    },
    calcProgress(days) {
        if (days === null) return 0;
        if (days <= 0) return 100;
        // Progress relative to a 30-day billing cycle for better visual resolution
        return Math.min(100, Math.max(5, (days / 30) * 100));
    },
    getBarColor(expired, urgent) {
        if (expired) return 'var(--danger)';
        if (urgent) return 'var(--warning)';
        return 'var(--primary)';
    }
};

// --- MODULE 4: MAIN APP CONTROLLER ---
const App = {
    state: {
        customers: [],
        currentCategory: 'IPTV',
        searchQuery: '',
        filterStatus: 'all',
        activeTimers: {},
        pageSize: 50,
        visibleCount: 50,
        analyticsChart: null,
        selectedCustomerForTemplate: null,
        selectedCustomer: null,
        dateFilter: ''
    },
    config: {
        IPTV_TABLE: 'egy_customers',
        EGY_TABLE: 'egy_customers',
        DEFAULT_URL: window.APP_CONFIG?.SB_URL || '',
        DEFAULT_KEY: window.APP_CONFIG?.SB_KEY || ''
    },
    init() {
        this.checkFirstTimeSetup();
        this.setupEventListeners();
        this.initBackend();
        this.updateQuickDateButtons(this.state.currentCategory);
    },
    checkFirstTimeSetup() {
        const key = localStorage.getItem('SB_KEY');
        if (!key) {
            const modal = document.getElementById('setup-modal');
            modal.style.display = 'flex';
            modal.classList.add('active');
            document.getElementById('setup-save-btn').onclick = () => {
                const url = document.getElementById('setup-sb-url').value.trim();
                const k = document.getElementById('setup-sb-key').value.trim();
                if (!url || !k) return alert('برجاء إدخال البيانات كاملة!');
                localStorage.setItem('SB_URL', url);
                localStorage.setItem('SB_KEY', k);
                modal.style.display = 'none';
                modal.classList.remove('active');
                this.initBackend();
            };
        }
    },
    initBackend() {
        const url = localStorage.getItem('SB_URL') || this.config.DEFAULT_URL;
        const key = localStorage.getItem('SB_KEY') || this.config.DEFAULT_KEY;
        
        // Update settings inputs if they exist
        const urlInput = document.getElementById('setting-sb-url');
        const keyInput = document.getElementById('setting-sb-key');
        const ghTokenInput = document.getElementById('setting-gh-token');
        const ghRepoInput = document.getElementById('setting-gh-repo');
        
        if (urlInput) urlInput.value = url;
        if (keyInput) keyInput.value = key;
        if (ghTokenInput) ghTokenInput.value = localStorage.getItem('GH_TOKEN') || '';
        if (ghRepoInput) ghRepoInput.value = localStorage.getItem('GH_REPO') || '';

        SupabaseService.init(url, key);
        this.sync();
    },
    async sync() {
        // Immediate UI reset to ensure the "previous system" disappears instantly
        this.state.customers = [];
        this.render();
        this.updateStats();

        this.showToast(`جاري تحميل بيانات ${this.state.currentCategory}... 🔄`);
        const table = this.state.currentCategory === 'EGY' ? this.config.EGY_TABLE : this.config.IPTV_TABLE;
        const { data, error } = await SupabaseService.fetchData(table);

        if (!error) {
            // Deduplicate by username (case-insensitive)
            const uniqueMap = new Map();
            data.forEach(c => {
                const u = String(c.username).toLowerCase().trim();
                // If duplicates exist, the last one wins (usually the most recent)
                uniqueMap.set(u, c);
            });
            this.state.customers = Array.from(uniqueMap.values());

            this.render();
            this.updateStatusUI(true);
        } else {
            this.updateStatusUI(false);
            this.showToast("خطأ في الاتصال! ⚠️");
        }
    },
    setupEventListeners() {
        document.getElementById('mode-iptv').onclick = () => this.switchCategory('IPTV');
        document.getElementById('mode-egy').onclick = () => this.switchCategory('EGY');

        const sideToggle = document.getElementById('sidebar-toggle');
        const sidebar = document.getElementById('sidebar');
        const sideOverlay = document.getElementById('sidebar-overlay');
        const toggle = () => { sidebar.classList.toggle('active'); sideOverlay.classList.toggle('active'); };
        if (sideToggle) sideToggle.onclick = toggle;
        if (sideOverlay) sideOverlay.onclick = toggle;
        document.getElementById('close-sidebar').onclick = toggle;

        // Sync Server Action
        const syncBtn = document.getElementById('btn-sync-server');
        if (syncBtn) {
            syncBtn.onclick = () => {
                document.getElementById('sync-modal').classList.add('active');
            };
        }

        document.getElementById('close-sync-modal').onclick = () => {
            document.getElementById('sync-modal').classList.remove('active');
        };

        document.getElementById('start-sync-action').onclick = async () => {
            const user = document.getElementById('sync-user').value;
            const key = document.getElementById('sync-key').value;
            const pass = document.getElementById('sync-pass').value;

            if (!pass) return alert("برجاء كتابة كلمة السر أولاً!");

            const githubToken = localStorage.getItem('GH_TOKEN');
            const githubRepo = localStorage.getItem('GH_REPO') || window.APP_CONFIG?.GH_REPO;

            if (!githubToken || !githubRepo) {
                alert("برجاء ضبط إعدادات GitHub (Token & Repo) من قائمة الإعدادات أولاً!");
                return;
            }

            this.showToast("جاري إرسال أمر المزامنة للسحابة... ☁️");
            
            try {
                const response = await fetch(`https://api.github.com/repos/${githubRepo}/actions/workflows/sync.yml/dispatches`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${githubToken}`,
                        'Accept': 'application/vnd.github+json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        ref: 'main',
                        inputs: {
                            panel_user: user,
                            panel_pass: pass,
                            panel_key: key
                        }
                    })
                });

                if (response.ok) {
                    this.showToast("تم بدء المزامنة بنجاح! استنى دقيقة واعمل ريفريش. ✅");
                    document.getElementById('sync-modal').classList.remove('active');
                } else {
                    const err = await response.text();
                    console.error(err);
                    alert("فشل بدء المزامنة! تأكد من الـ Token وإعدادات المستودع.");
                }
            } catch (e) {
                alert("حدث خطأ في الاتصال بـ GitHub!");
            }
        };

        // Filter Tabs Logic
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.filterStatus = btn.dataset.filter;
                this.render();
            };
        });

        // Close dropdown when clicking outside
        window.onclick = (e) => {
            if (!e.target.matches('.btn-gear')) {
                document.querySelectorAll('.c-action-menu.active').forEach(m => m.classList.remove('active'));
            }
            if (e.target.matches('.overlay')) {
                toggle();
            }
        };



        const saveSettingsBtn = document.getElementById('save-settings');
        if (saveSettingsBtn) {
            saveSettingsBtn.onclick = () => {
                const url = document.getElementById('setting-sb-url').value;
                const key = document.getElementById('setting-sb-key').value;
                const ghToken = document.getElementById('setting-gh-token').value;
                const ghRepo = document.getElementById('setting-gh-repo').value;

                localStorage.setItem('SB_URL', url);
                localStorage.setItem('SB_KEY', key);
                localStorage.setItem('GH_TOKEN', ghToken);
                localStorage.setItem('GH_REPO', ghRepo);

                this.showToast("تم حفظ الإعدادات! سيتم إعادة التحميل... 🔄");
                setTimeout(() => location.reload(), 1500);
            };
        }

        // Pagination
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.onclick = () => {
                this.state.visibleCount += this.state.pageSize;
                this.render(true); // true means append mode
            };
        }

        let searchTimeout;
        document.getElementById('search-input').oninput = (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.state.searchQuery = e.target.value;
                this.state.visibleCount = this.state.pageSize; // Reset pagination on search
                this.render();
            }, 300);
        };
        document.querySelectorAll('.filter-chip').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.filterStatus = btn.dataset.filter;
                this.render();
            };
        });

        // Add Enter key support for search
        document.getElementById('search-input').onkeydown = (e) => {
            if (e.key === 'Enter') {
                this.state.searchQuery = e.target.value;
                this.render();
            }
        };

        // Date Filter Handler
        const dateInput = document.getElementById('date-filter-input');
        dateInput.onchange = (e) => {
            this.state.dateFilter = e.target.value;
            this.render();
        };

        document.getElementById('clear-date-filter').onclick = () => {
            dateInput.value = '';
            this.state.dateFilter = '';
            this.render();
        };

        document.querySelectorAll('.q-date-btn').forEach(btn => {
            btn.onclick = () => {
                const months = parseInt(btn.dataset.months);
                const d = new Date();
                // If it's a 3-month EGY sub, we can set it accurately
                d.setMonth(d.getMonth() + months);
                document.getElementById('new-expire').value = d.toISOString().split('T')[0];

                document.querySelectorAll('.q-date-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
        });

        document.getElementById('save-new-customer').onclick = () => this.handleAddCustomer();
        document.getElementById('close-modal').onclick = () => document.getElementById('message-modal').classList.remove('active');

        // Manage Modal Listeners
        document.getElementById('close-manage-modal').onclick = () => this.closeManageModal();
        document.getElementById('save-edit-btn').onclick = () => this.saveCustomerEdit();
        document.getElementById('delete-btn-modal').onclick = () => {
            const id = document.getElementById('edit-id').value;
            const customer = this.state.customers.find(c => c.id == id);
            if (customer) {
                this.closeManageModal();
                this.startSafetyFlow(customer, 'delete');
            }
        };

        // Excel / CSV Upload Handler
        document.getElementById('excel-upload').onchange = (e) => this.handleExcelUpload(e);

        // Export Handler
        document.getElementById('export-excel').onclick = () => this.handleExport();

        // Analytics Modal Trigger
        document.getElementById('btn-show-analytics').onclick = () => {
            document.getElementById('analytics-modal').classList.add('active');
            this.updateAnalyticsChart();
        };

        // Close Analytics Modal
        const closeAnalyticsBtn = document.getElementById('close-analytics-modal');
        if (closeAnalyticsBtn) {
            closeAnalyticsBtn.onclick = () => {
                document.getElementById('analytics-modal').classList.remove('active');
            };
        }

        // Settings Modal
        const settingsBtn = document.getElementById('btn-open-settings');
        if (settingsBtn) {
            settingsBtn.onclick = () => {
                document.getElementById('modal-settings').classList.add('active');
            };
        }
        const closeSettingsBtn = document.getElementById('close-settings-modal');
        if (closeSettingsBtn) {
            closeSettingsBtn.onclick = () => {
                document.getElementById('modal-settings').classList.remove('active');
            };
        }
        // Templates Handler
        document.getElementById('close-templates-modal').onclick = () => {
            document.getElementById('templates-modal').classList.remove('active');
        };

        document.querySelectorAll('.template-option-btn').forEach(btn => {
            btn.onclick = () => {
                const type = btn.dataset.type;
                this.sendTemplateMessage(type);
            };
        });
    },
    handleExport() {
        const table = this.state.currentCategory;
        const data = this.state.customers;
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
        XLSX.writeFile(workbook, `CRM_${table}_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
        this.showToast("تم تصدير الملف بنجاح! 📤");
    },
    async handleExcelUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = evt.target.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                this.showToast(`جاري استيراد ${json.length} عميل... ⏳`);
                const table = this.state.currentCategory === 'EGY' ? this.config.EGY_TABLE : this.config.IPTV_TABLE;

                for (const row of json) {
                    const rawDate = row.expire_date || row.Expiry || row['التاريخ'] || row['expire'] || '';
                    const payload = {
                        username: row.username || row.Name || row['الاسم'] || 'Unknown',
                        password: row.password || row.Password || row['الباسورد'] || '',
                        expire_date: Utils.normalizeDate(rawDate),
                        status: 'Enabled'
                    };
                    if (this.state.currentCategory === 'EGY') {
                        payload.mac_address = row.mac_address || row.MAC || '';
                        payload.phone_number = row.phone_number || row.Phone || '';
                    }
                    await SupabaseService.addCustomer(table, payload);
                }

                this.showToast("تم الاستيراد بنجاح! ✅");
                this.sync();
            } catch (err) {
                console.error(err);
                this.showToast("فشل استيراد الملف! ❌");
            }
        };
        reader.readAsBinaryString(file);
    },
    switchCategory(cat) {
        this.state.currentCategory = cat;

        // Update visual mode on body for CSS-based system distinction
        document.body.className = cat === 'EGY' ? 'mode-egy' : 'mode-iptv';

        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(cat === 'IPTV' ? 'mode-iptv' : 'mode-egy').classList.add('active');

        document.getElementById('stats-title').innerText = `📊 إحصائيات ${cat}`;
        document.getElementById('egy-fields').style.display = cat === 'EGY' ? 'block' : 'none';

        this.sync();
        this.updateQuickDateButtons(cat);
    },
    updateQuickDateButtons(cat) {
        const container = document.getElementById('quick-dates-container');
        if (!container) return;

        if (cat === 'EGY') {
            container.innerHTML = `<button class="q-date-btn active" data-months="3">3 شهور</button>`;
        } else {
            container.innerHTML = `
                <button class="q-date-btn" data-months="3">3 شهور</button>
                <button class="q-date-btn" data-months="6">6 شهور</button>
                <button class="q-date-btn active" data-months="12">12 شهر</button>
            `;
        }
        // Re-bind listeners
        container.querySelectorAll('.q-date-btn').forEach(btn => {
            btn.onclick = () => {
                const months = parseInt(btn.dataset.months);
                const d = new Date(); d.setMonth(d.getMonth() + months);
                document.getElementById('new-expire').value = d.toISOString().split('T')[0];
                container.querySelectorAll('.q-date-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
        });
    },
    async handleAddCustomer() {
        const user = document.getElementById('new-username').value;
        const pass = document.getElementById('new-password').value;
        const expire = document.getElementById('new-expire').value;
        if (!user || !expire) return alert("البيانات ناقصة!");

        const table = this.state.currentCategory === 'EGY' ? this.config.EGY_TABLE : this.config.IPTV_TABLE;
        const payload = { username: user, password: pass, expire_date: expire, status: 'Enabled' };
        if (this.state.currentCategory === 'EGY') {
            payload.mac_address = document.getElementById('new-mac').value;
            payload.phone_number = document.getElementById('new-phone').value;
            payload.note = document.getElementById('new-note').value;
        }
        const { error } = await SupabaseService.addCustomer(table, payload);
        if (!error) {
            this.showToast("تمت الإضافة بنجاح!");
            this.resetForm(); this.sync();
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebar-overlay').classList.remove('active');
        }
    },
    render(append = false) {
        const list = document.getElementById('customer-list');
        const loadMoreContainer = document.getElementById('load-more-container');
        
        if (!append) {
            list.innerHTML = '';
            this.state.visibleCount = this.state.pageSize;
        }

        const filtered = this.state.customers.filter(c => {
            const search = this.state.searchQuery.toLowerCase();
            const matchesSearch = c.username.toLowerCase().includes(search) ||
                (c.password && c.password.toLowerCase().includes(search)) ||
                (c.mac_address && c.mac_address.toLowerCase().includes(search)) ||
                (c.phone_number && String(c.phone_number).includes(search));
            const days = Utils.getRemainingDays(c.expire_date);
            let matchesFilter = true;

            // Date Filter Check
            if (this.state.dateFilter) {
                const normalized = Utils.normalizeDate(c.expire_date);
                if (normalized !== this.state.dateFilter) return false;
            }

            if (this.state.filterStatus === 'active') matchesFilter = (days !== null && days >= 0);
            else if (this.state.filterStatus === 'expired') matchesFilter = (days !== null && days < 0);
            else if (this.state.filterStatus === 'urgent') matchesFilter = (days !== null && days >= 0 && days <= 7);

            return matchesSearch && matchesFilter;
        }).sort((a, b) => {
            const da = Utils.getRemainingDays(a.expire_date);
            const db = Utils.getRemainingDays(b.expire_date);
            if (da === null) return 1;
            if (db === null) return -1;
            
            // Show highest days at top (Longest active duration OR most recently expired)
            return db - da;
        });

        if (filtered.length === 0 && !append) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📂</div>
                    <p>لا توجد نتائج مطابقة لبحثك</p>
                </div>
            `;
            loadMoreContainer.style.display = 'none';
        } else {
            const fragment = document.createDocumentFragment();
            const slice = filtered.slice(append ? this.state.visibleCount - this.state.pageSize : 0, this.state.visibleCount);
            
            slice.forEach(c => {
                const card = Components.createCustomerCard(c, this.state.currentCategory);
                fragment.appendChild(card);
            });
            
            list.appendChild(fragment);
            
            // Show/Hide Load More
            if (filtered.length > this.state.visibleCount) {
                loadMoreContainer.style.display = 'block';
            } else {
                loadMoreContainer.style.display = 'none';
            }
        }

        this.updateStats();
        document.getElementById('results-count').innerText = filtered.length;
    },
    showSkeleton() {
        const list = document.getElementById('customer-list');
        list.innerHTML = Array(4).fill(0).map(() => `<div class="skeleton skeleton-card"></div>`).join('');
    },
    closeModals() {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    },
    async startSafetyFlow(customer, actionType, months = 1) {
        const overlay = document.getElementById(`safety-${customer.id}`);
        const timerText = overlay.querySelector('.safety-timer');
        const statusText = document.getElementById(`safety-text-${customer.id}`);
        const cancelBtn = overlay.querySelector('.btn-cancel');

        overlay.classList.add('active');
        let count = 5;
        timerText.innerText = count;
        statusText.innerText = actionType === 'renew' ? `جاري تجديد ${months} شهر...` : 'جاري الحذف النهائي...';

        const timer = setInterval(() => {
            count--;
            timerText.innerText = count;
            if (count === 0) {
                clearInterval(timer);
                this.executeAction(customer, actionType, months);
            }
        }, 1000);

        this.state.activeTimers[customer.id] = timer;

        cancelBtn.onclick = () => {
            clearInterval(timer);
            overlay.classList.remove('active');
            delete this.state.activeTimers[customer.id];
            this.showToast("تم الإلغاء 🛡️");
        };
    },
    async executeAction(customer, actionType, months = 1) {
        const safetyOverlay = document.getElementById(`safety-${customer.id}`);
        const successOverlay = document.getElementById(`success-${customer.id}`);

        safetyOverlay.classList.remove('active');

        let error = null;
        const table = this.state.currentCategory === 'EGY' ? this.config.EGY_TABLE : this.config.IPTV_TABLE;

        if (actionType === 'renew') {
            let date = new Date(customer.expire_date);
            if (isNaN(date.getTime()) || date < new Date()) date = new Date();
            date.setMonth(date.getMonth() + months);
            const res = await SupabaseService.updateCustomer(table, customer.id, { expire_date: date.toISOString().split('T')[0] });
            error = res.error;
        } else if (actionType === 'delete') {
            const res = await SupabaseService.deleteCustomer(table, customer.id);
            error = res.error;
        }

        if (!error) {
            successOverlay.classList.add('active');
            setTimeout(() => {
                successOverlay.classList.remove('active');
                this.sync();
            }, 2000);
        } else {
            this.showToast("فشلت العملية! ⚠️");
        }
    },
    async renew(customer) {
        // Obsolete - moved to safety flow
    },
    async delete(customer) {
        // Obsolete - moved to safety flow
    },
    updateStats() {
        let active = 0, expired = 0, urgent = 0;
        this.state.customers.forEach(c => {
            const d = Utils.getRemainingDays(c.expire_date);
            if (d !== null) {
                if (d < 0) {
                    expired++;
                } else {
                    active++;
                    if (d >= 0 && d <= 7) urgent++;
                }
            }
        });
        document.getElementById('stat-all').innerText = this.state.customers.length;
        document.getElementById('stat-active').innerText = active;
        document.getElementById('stat-urgent').innerText = urgent;
        document.getElementById('stat-expired').innerText = expired;

        this.updateAnalyticsChart();
    },
    updateAnalyticsChart() {
        const ctx = document.getElementById('analyticsChart');
        if (!ctx) return;

        // Categorization logic - MORE DETAILED
        let counts = {
            expired: 0,
            urgent: 0, // 0-7 days
            month: 0,  // 8-30 days
            quarter: 0,// 31-90 days
            half: 0,   // 91-180 days
            year: 0    // > 180 days
        };

        this.state.customers.forEach(c => {
            const days = Utils.getRemainingDays(c.expire_date);
            if (days === null) return;
            if (days < 0) counts.expired++;
            else if (days <= 7) counts.urgent++;
            else if (days <= 30) counts.month++;
            else if (days <= 90) counts.quarter++;
            else if (days <= 180) counts.half++;
            else counts.year++;
        });

        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        const labels = ['منتهي', 'أسبوع أو أقل', 'شهر واحد', '3 شهور', '6 شهور', 'سنة فأكثر'];
        const data = [counts.expired, counts.urgent, counts.month, counts.quarter, counts.half, counts.year];
        const colors = ['#ef4444', '#f97316', '#f59e0b', '#8b5cf6', '#6366f1', '#10b981'];

        // Extra Analytics Calculations
        const activeCount = total - counts.expired;
        const retentionRate = total ? Math.round((activeCount / total) * 100) : 0;
        
        let totalActiveDays = 0;
        this.state.customers.forEach(c => {
            const d = Utils.getRemainingDays(c.expire_date);
            if (d !== null && d >= 0) totalActiveDays += d;
        });
        const avgDays = activeCount ? Math.round(totalActiveDays / activeCount) : 0;

        // Update KPI Cards
        const retEl = document.getElementById('a-retention');
        const upcEl = document.getElementById('a-upcoming');
        const avgEl = document.getElementById('a-avg-days');
        if (retEl) retEl.innerText = `${retentionRate}%`;
        if (upcEl) upcEl.innerText = counts.urgent;
        if (avgEl) avgEl.innerText = `${avgDays} يوم`;

        // Detailed Insights Logic - Custom Pricing & Profit
        let totalForecast = 0;
        let totalProfit = 0;
        const isIPTV = this.state.currentCategory === 'IPTV';
        
        this.state.customers.forEach(c => {
            const days = Utils.getRemainingDays(c.expire_date);
            if (days !== null && days >= 0 && days <= 7) {
                if (isIPTV) {
                    // Based on user: 90% renew for 650, 10% for 200
                    // Profit: (650-180=470) for 90%, (200-60=140) for 10%
                    totalForecast += (650 * 0.9) + (200 * 0.1); 
                    totalProfit += (470 * 0.9) + (140 * 0.1); 
                } else {
                    totalForecast += 200; // EGY Sell
                    totalProfit += 110;   // EGY Profit (200-90)
                }
            }
        });
        
        const forecastEl = document.getElementById('i-forecast');
        const netProfitEl = document.getElementById('i-net-profit');
        const qualityEl = document.getElementById('i-data-quality');
        if (forecastEl) forecastEl.innerText = `${Math.round(totalForecast)} ج.م`;
        if (netProfitEl) netProfitEl.innerText = `${Math.round(totalProfit)} ج.م`;

        // Data quality = % of customers with valid expire_date
        const withDate = this.state.customers.filter(c => c.expire_date).length;
        const dataQuality = this.state.customers.length ? Math.round((withDate / this.state.customers.length) * 100) : 0;
        if (qualityEl) qualityEl.innerText = `${dataQuality}%`;

        // Update Legend
        const legend = document.getElementById('chartLegend');
        if (legend) {
            legend.innerHTML = labels.map((label, i) => `
                <div class="legend-item">
                    <div class="legend-label">
                        <div class="legend-dot" style="background:${colors[i]}"></div>
                        <span>${label}</span>
                    </div>
                    <span class="legend-percent">${total ? Math.round((data[i] / total) * 100) : 0}%</span>
                </div>
            `).join('');
        }

        if (this.state.analyticsChart) {
            this.state.analyticsChart.data.datasets[0].data = data;
            this.state.analyticsChart.update();
        } else {
            this.state.analyticsChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: true }
                    },
                    cutout: '70%'
                }
            });
        }
    },
    openTemplateModal(customer) {
        // Fallback to username for IPTV if phone_number is missing
        const resolvedPhone = customer.phone_number || (this.state.currentCategory === 'IPTV' ? customer.username : null);
        
        if (!resolvedPhone) return alert("⚠️ عذراً، لا يوجد رقم هاتف مسجل لهذا العميل!");
        
        this.state.selectedCustomerForTemplate = { ...customer, resolvedPhone };
        
        // Smart Filter Logic: Hide/Show buttons based on status
        const days = Utils.getRemainingDays(customer.expire_date);
        const isExpired = (days !== null && days < 0);
        
        const btnReminder = document.getElementById('tmp-reminder');
        const btnExpired = document.getElementById('tmp-expired');
        const btnWelcome = document.getElementById('tmp-welcome');

        if (isExpired) {
            if (btnReminder) btnReminder.style.display = 'none';
            if (btnWelcome) btnWelcome.style.display = 'none';
            if (btnExpired) btnExpired.style.display = 'flex';
        } else {
            if (btnReminder) btnReminder.style.display = 'flex';
            if (btnWelcome) btnWelcome.style.display = 'flex';
            if (btnExpired) btnExpired.style.display = 'none';
        }

        const nameEl = document.getElementById('template-customer-name');
        if (nameEl) nameEl.innerText = `العميل: ${customer.username}`;
        document.getElementById('templates-modal').classList.add('active');
    },
    sendTemplateMessage(type) {
        const c = this.state.selectedCustomerForTemplate;
        if (!c || !c.resolvedPhone) return alert("رقم الهاتف غير متوفر!");

        const name = c.username;
        let phone = String(c.resolvedPhone).replace(/\D/g, '');
        
        // Smart Egyptian Phone Formatting
        if (phone.length === 11 && phone.startsWith('01')) {
            phone = '20' + phone.substring(1);
        } else if (phone.length === 10 && phone.startsWith('1')) {
            phone = '20' + phone;
        }

        const days = Utils.getRemainingDays(c.expire_date);
        const displayDate = Utils.formatDisplayDate(c.expire_date);
        let msg = "";

        switch (type) {
            case 'reminder':
                msg = `أهلاً بك عميلنا العزيز ${name}، نود تذكيرك من "التهامي جروب" بأن اشتراكك سينتهي بتاريخ ${displayDate} (متبقي ${days} يوم). يسعدنا استمرارك معنا، للتجديد يرجى التواصل معنا. نتمنى لك مشاهدة ممتعة.`;
                break;
            case 'expired':
                msg = `أهلاً بك عميلنا العزيز ${name}، نود إحاطتك من "التهامي جروب" بأن اشتراكك قد انتهى بتاريخ ${displayDate}. يسعدنا تواصلك معنا لتجديد الخدمة والاستمتاع بمحتوانا الحصري. نحن في انتظارك!`;
                break;
            case 'welcome':
                msg = `أهلاً بك في "التهامي جروب" عميلنا العزيز ${name}! يسعدنا انضمامك إلينا؛ تم تفعيل اشتراكك بنجاح وسينتهي بتاريخ ${displayDate}. شكراً لثقتك بنا ونتمنى لك تجربة فريدة ومشاهدة ممتعة.`;
                break;
            case 'general':
                msg = `أهلاً بك في "التهامي جروب"، كيف يمكننا مساعدتك اليوم؟`;
                break;
        }

        const encodedMsg = encodeURIComponent(msg);
        window.open(`https://wa.me/${phone}?text=${encodedMsg}`, '_blank');
        document.getElementById('templates-modal').classList.remove('active');
    },
    updateStatusUI(online) {
        const dot = document.getElementById('sync-dot');
        const txt = document.getElementById('sync-text');
        if (!dot || !txt) return;
        dot.className = online ? 'pulse-dot online' : 'pulse-dot';
        txt.innerText = online ? `Cloud Online (${this.state.currentCategory})` : 'Cloud Offline';
    },
    showToast(msg) {
        const toast = document.getElementById('copy-toast');
        if (!toast) return;
        toast.innerText = msg;
        toast.style.display = 'block';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        toast.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(() => { toast.style.display = 'none'; }, 300);
        }, 2500);
    },
    copyText(text) {
        const ok = Utils.copyToClipboard(text);
        if (ok) this.showToast("تم النسخ بنجاح! ✅");
    },
    resetForm() {
        ['new-username', 'new-password', 'new-expire', 'new-mac', 'new-phone', 'new-note'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    },
    exportToVCF() {
        const customers = this.state.customers;
        if (customers.length === 0) return alert("لا توجد بيانات لتصديرها!");

        let vcfContent = "";
        customers.forEach(c => {
            const name = c.username || `عميل ${this.state.currentCategory}`;
            const phone = String(c.phone_number || '').replace(/\s/g, '');
            if (phone) {
                vcfContent += `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;TYPE=CELL:${phone}\nEND:VCARD\n`;
            }
        });

        const blob = new Blob([vcfContent], { type: "text/vcard" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Contacts_${this.state.currentCategory}_${new Date().toISOString().split('T')[0]}.vcf`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        this.showToast("تم إنشاء ملف جهات الاتصال! 📱✅");
    },
    openManageModal(customer) {
        this.state.selectedCustomer = customer;
        document.getElementById('edit-id').value = customer.id;
        document.getElementById('edit-username').value = customer.username || '';
        document.getElementById('edit-password').value = customer.password || '';
        document.getElementById('edit-expire').value = Utils.normalizeDate(customer.expire_date) || '';
        document.getElementById('edit-mac').value = customer.mac_address || '';
        document.getElementById('edit-phone').value = customer.phone_number || '';
        document.getElementById('edit-note').value = customer.notes || '';

        // Category specific fields
        const isEgy = this.state.currentCategory === 'EGY';
        document.querySelectorAll('.egy-only').forEach(el => el.style.display = isEgy ? 'block' : 'none');

        // Setup dynamic renew buttons in modal
        const renewContainer = document.getElementById('manage-renew-btns');
        const months = isEgy ? [3] : [3, 6, 12];
        renewContainer.innerHTML = months.map(m => `<button class="btn-renew-opt" data-months="${m}">${m} شهر</button>`).join('');

        renewContainer.querySelectorAll('.btn-renew-opt').forEach(btn => {
            btn.onclick = () => {
                const m = parseInt(btn.dataset.months);
                this.closeManageModal();
                this.startSafetyFlow(customer, 'renew', m);
            };
        });

        document.getElementById('manage-modal').classList.add('active');
    },
    closeManageModal() {
        document.getElementById('manage-modal').classList.remove('active');
    },
    async saveCustomerEdit() {
        const id = document.getElementById('edit-id').value;
        const updates = {
            username: document.getElementById('edit-username').value,
            password: document.getElementById('edit-password').value,
            expire_date: document.getElementById('edit-expire').value,
            mac_address: document.getElementById('edit-mac').value,
            phone_number: document.getElementById('edit-phone').value,
            notes: document.getElementById('edit-note').value
        };

        this.showToast("جاري حفظ التعديلات... ⏳");
        const table = this.state.currentCategory === 'EGY' ? this.config.EGY_TABLE : this.config.IPTV_TABLE;
        const { error } = await SupabaseService.client.from(table).update(updates).eq('id', id);

        if (!error) {
            this.showToast("تم الحفظ بنجاح! ✅");
            this.closeManageModal();
            this.sync();
        } else {
            this.showToast("فشل الحفظ! ⚠️");
        }
    },
    openWhatsApp(customer) {
        const phone = customer.phone_number ? String(customer.phone_number).replace(/\D/g, '') : '';
        const system = this.state.currentCategory;
        const date = Utils.formatDisplayDate(customer.expire_date);
        const defaultMsg = `مرحباً أ/ ${customer.username}%0Aنود تذكيركم بأن اشتراك ${system} الخاص بكم سينتهي بتاريخ ${date}.%0Aللتجديد أو الاستفسار يرجى التواصل معنا.%0Aشكراً لاختياركم لنا! ❤️`;

        window.open(`https://wa.me/${phone}?text=${defaultMsg}`, '_blank');
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}
