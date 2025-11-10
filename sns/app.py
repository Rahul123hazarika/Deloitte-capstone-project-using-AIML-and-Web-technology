import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, session
import os
import re
import pickle
import traceback
import json
import csv
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)

app.secret_key = 'MakeMyTrip'  # IMPORTANT: Change this!

JSON_FILE = 'users.json'
CSV_FILE = 'users.csv'
EXCEL_FILE = 'users.xlsx'
MODEL_PKL_FILE = 'trained_model.pkl'
DATASET_CSV_FILE = 'Final_Dataset.csv'


def initialize_files():
    if not os.path.exists(JSON_FILE):
        with open(JSON_FILE, 'w') as f: json.dump([], f)
    if not os.path.exists(CSV_FILE):
        with open(CSV_FILE, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['id', 'username', 'email', 'password_hash', 'created_at'])
    if not os.path.exists(EXCEL_FILE):
        pd.DataFrame(columns=['id', 'username', 'email', 'password_hash', 'created_at']).to_excel(EXCEL_FILE,
                                                                                                  index=False)


initialize_files()  # Call at startup


def validate_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def validate_password(password):
    if len(password) < 8: return False, "Password must be at least 8 characters long"
    if not re.search(r'[A-Z]', password): return False, "Password must contain at least one uppercase letter"
    if not re.search(r'[a-z]', password): return False, "Password must contain at least one lowercase letter"
    if not re.search(r'\d', password): return False, "Password must contain at least one number"
    return True, "Password is valid"


def get_users_from_json():
    try:
        with open(JSON_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def save_user_to_files(user_data):
    users = get_users_from_json()
    user_data['id'] = (max(user['id'] for user in users) + 1) if users else 1
    users.append(user_data)
    with open(JSON_FILE, 'w') as f:
        json.dump(users, f, indent=2)

    file_exists = os.path.isfile(CSV_FILE)
    with open(CSV_FILE, 'a', newline='') as f:
        writer = csv.writer(f)
        if not file_exists or os.path.getsize(CSV_FILE) == 0:
            writer.writerow(['id', 'username', 'email', 'password_hash', 'created_at'])
        writer.writerow([user_data['id'], user_data['username'], user_data['email'],
                         user_data['password_hash'], user_data['created_at']])
    try:
        df_excel = pd.read_excel(EXCEL_FILE) if os.path.exists(EXCEL_FILE) and os.path.getsize(
            EXCEL_FILE) > 0 else pd.DataFrame(columns=['id', 'username', 'email', 'password_hash', 'created_at'])
        new_row_df = pd.DataFrame([user_data])
        df_excel = pd.concat([df_excel, new_row_df], ignore_index=True)
        df_excel.to_excel(EXCEL_FILE, index=False)
    except Exception as e:
        print(f"Error saving to Excel: {e}")


# --- CORRECTED User lookup functions ---
# You had these correctly defined in your last full code post.
def find_user_by_username_or_email(identifier):
    """Finds a user by EITHER their username OR their email."""
    users = get_users_from_json()
    for user in users:
        if user['username'] == identifier or user['email'] == identifier:
            return user
    return None


def find_user_by_field(field_name, value):
    """Finds a user by a specific field (e.g., 'username' or 'email')."""
    users = get_users_from_json()
    for user in users:
        if user.get(field_name) == value:
            return user
    return None


# --- CORRECTED AUTHENTICATION AND CORE NAVIGATION ROUTES ---
@app.route('/')
def index():
    # if 'user_id' in session:
    #     return redirect(url_for('user')) # 'user' is your dashboard route name
    return render_template('index.html')


@app.route('/login', methods=['GET'])  # Added methods=['GET'] for clarity
def log():  # This function name 'log' is used in your url_for('log')
    if 'user_id' in session:
        # ***** CORRECTED: If already logged in, redirect to the main user dashboard *****
        return redirect(url_for('user'))  # 'user' is your dashboard route function name
    return render_template('auth.html')


@app.route('/signup', methods=['POST'])
def signup():
    username = request.form.get('username', '').strip()
    email = request.form.get('email', '').strip()
    password = request.form.get('password', '')
    confirm_password = request.form.get('confirm_password', '')

    errors = []
    if not username or len(username) < 3: errors.append("Username must be at least 3 characters long")
    if not email or not validate_email(email): errors.append("Please enter a valid email address")

    is_valid_pwd, pwd_msg = validate_password(password)
    if not is_valid_pwd: errors.append(pwd_msg)
    if password != confirm_password: errors.append("Passwords do not match")

    # ***** CORRECTED: Use find_user_by_field for specific checks *****
    if find_user_by_field('username', username):
        errors.append("Username already exists")
    if find_user_by_field('email', email):
        errors.append("Email already registered")

    if errors:
        for error in errors: flash(error, 'error')
        # ***** CORRECTED: Redirect back to the login/signup page ('log' endpoint) on error *****
        return redirect(url_for('log'))

    user_data = {
        'username': username, 'email': email,
        'password_hash': generate_password_hash(password),
        'created_at': datetime.now().isoformat()
    }
    save_user_to_files(user_data)

    session['user_id'] = user_data['id']
    session['username'] = username

    flash('Account created successfully! You are now logged in.', 'success')
    # ***** CORRECTED: Redirect to the main user dashboard after successful signup *****
    return redirect(url_for('user'))  # 'user' is your dashboard route


@app.route('/login', methods=['POST'])
def login():
    username_or_email = request.form.get('username_or_email', '').strip()
    password = request.form.get('password', '')

    if not username_or_email or not password:
        flash('Please enter both username/email and password.', 'error')
        # ***** CORRECTED: Redirect back to the login/signup page ('log' endpoint) on error *****
        return redirect(url_for('log'))

    # ***** CORRECTED: Use find_user_by_username_or_email for login *****
    found_user = find_user_by_username_or_email(username_or_email)

    if not found_user or not check_password_hash(found_user['password_hash'], password):
        flash('Invalid username/email or password.', 'error')
        # ***** CORRECTED: Redirect back to the login/signup page ('log' endpoint) *****
        return redirect(url_for('log'))

    session['user_id'] = found_user['id']
    session['username'] = found_user['username']

    flash(f'Welcome back, {found_user["username"]}!', 'success')
    # ***** CORRECTED: Redirect to the main user dashboard ('user' endpoint) *****
    return redirect(url_for('user'))


@app.route('/logout')
def logout():
    # Delete the trained model file
    if os.path.exists(MODEL_PKL_FILE):
        try:
            os.remove(MODEL_PKL_FILE)
            print(f"'{MODEL_PKL_FILE}' deleted on logout.")
        except Exception as e:
            print(f"Error deleting '{MODEL_PKL_FILE}' on logout: {e}")
            flash('You have been logged out. Could not reset the prediction model.', 'warning')
    else:
        flash('You have been logged out successfully.', 'info')


    global predictor
    predictor = PlatformPredictor()
    print("Global predictor object has been re-initialized on logout.")

    session.clear()
    flash('You have been logged out successfully.', 'info')  # Message slightly changed for clarity
    return redirect(url_for('index'))


# --- PROTECTED USER ROUTES ---
@app.route('/user')  # This is your main dashboard route for logged-in users
def user():
    # ***** CORRECTED: Add authentication check *****
    if 'user_id' not in session:
        flash("Please log in to view your dashboard.", "warning")
        return redirect(url_for('log'))
        # ***** CORRECTED: Safe access to session username *****
    username_to_display = session.get('username', 'User')  # Provide a default
    return render_template('dashboard.html', username=username_to_display)


@app.route('/home')
def home():
    # ***** CORRECTED: Add authentication check and redirect to main dashboard if logged in *****
    if 'user_id' not in session:
        flash("Please log in to access this page.", "warning")
        return redirect(url_for('log'))
        # If logged in, /home should likely show the user's main dashboard area
    return redirect(url_for('user'))


# --- PlatformPredictor Class (Keep your existing class definition here) ---
class PlatformPredictor:
    def __init__(self):
        print("PlatformPredictor __init__ called")
        self.model = None
        self.le_platform = None
        self.le_subcat = None
        self.is_trained = False
        self.subcategory_medians = {}
        self.overall_medians = {}
        self.model_df = None

    def load_and_prepare_data(self, csv_path):
        print(f"load_and_prepare_data called with {csv_path}")
        try:
            df = pd.read_csv(csv_path)
            df["Rating"] = pd.to_numeric(df["Rating"].astype(str).str.replace(r"[^\d.]", "", regex=True),
                                         errors="coerce")
            df["Rating_Count"] = pd.to_numeric(df["Rating_Count"].astype(str).str.replace(r"[^\d.]", "", regex=True),
                                               errors="coerce")
            for col_name in ["Rating", "Rating_Count"]:
                df[col_name] = df.groupby("Subcategory", group_keys=False, dropna=False)[col_name].apply(
                    lambda x: x.fillna(x.median()))
                df[col_name] = df[col_name].fillna(df[col_name].median())
            df = df.drop(columns=["Unnamed: 0"], errors='ignore')
            for col in ["Selling Price", "MRP", "Discount"]:
                df[col] = df[col].replace('[^0-9.]', '', regex=True)
                df[col] = pd.to_numeric(df[col], errors='coerce')
            essential_cols = ["Selling Price", "MRP", "Discount", "Rating", "Rating_Count", "Subcategory", "Platform"]
            df = df.dropna(subset=essential_cols).reset_index(drop=True)
            if df.empty:
                print("DataFrame became empty after dropping NaNs in essential columns.")
                self.overall_medians = {};
                self.model_df = None;
                return None
            numeric_cols_for_median = ["Selling Price", "MRP", "Discount", "Rating", "Rating_Count"]
            self.overall_medians = df[numeric_cols_for_median].median().to_dict()
            print(f"Overall medians calculated: {self.overall_medians}")
            self.model_df = df.copy()
            print("Data loaded and prepared successfully.")
            return df
        except Exception as e:
            print(f"Error in load_and_prepare_data: {e}\n{traceback.format_exc()}")
            self.overall_medians = {};
            self.model_df = None;
            return None

    def train_model(self, df):
        print("train_model called")
        if df is None or df.empty:
            print("train_model: DataFrame is None or empty.")
            return None
        try:
            numeric_cols_for_median = ["Selling Price", "MRP", "Discount", "Rating", "Rating_Count"]
            if 'Subcategory' in df.columns and not df['Subcategory'].isnull().all():
                self.subcategory_medians = df.groupby('Subcategory')[numeric_cols_for_median].median().to_dict('index')
                print(f"Subcategory medians calculated. Count: {len(self.subcategory_medians)}")
            else:
                print("Warning: 'Subcategory' column issues for subcategory_medians.")
                self.subcategory_medians = {}

            if not self.overall_medians and all(col in df.columns for col in numeric_cols_for_median):
                self.overall_medians = df[numeric_cols_for_median].median().to_dict()
                print(f"Overall medians calculated in train_model: {self.overall_medians}")
            elif not self.overall_medians:
                print("Warning: overall_medians could not be populated.")
                self.overall_medians = {}

            if 'Subcategory' not in df.columns or 'Platform' not in df.columns or df['Platform'].nunique() < 2:
                print("Error: Missing 'Subcategory'/'Platform' or insufficient classes for training.")
                return None

            self.le_subcat = LabelEncoder()
            df['Subcategory_encoded'] = self.le_subcat.fit_transform(df['Subcategory'])
            self.le_platform = LabelEncoder()
            y_encoded = self.le_platform.fit_transform(df['Platform'])

            X = df[["Selling Price", "MRP", "Discount", "Rating", "Rating_Count", "Subcategory_encoded"]]
            y = y_encoded

            if len(X) < 10 or len(np.unique(y)) < 2 or np.any(np.bincount(y) < 2):
                print(f"Error: Not enough data or classes to train. Samples: {len(X)}, Classes: {len(np.unique(y))}")
                return None

            X_train, X_test, y_train, y_test = train_test_split(X, y, stratify=y, test_size=0.2, random_state=42)

            self.model = xgb.XGBClassifier(  # Using your specified parameters
                n_estimators=200, max_depth=10, learning_rate=0.1, subsample=0.8,
                colsample_bytree=0.8, random_state=42, eval_metric='mlogloss'
            )
            self.model.fit(X_train, y_train)
            train_acc = self.model.score(X_train, y_train);
            test_acc = self.model.score(X_test, y_test)

            cv_scores_mean = 0.0;
            cv_scores_list = []
            if np.all(np.bincount(y) >= 5):
                skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
                cv_scores_obj = cross_val_score(self.model, X, y, cv=skf)  # Renamed to avoid conflict
                cv_scores_mean = cv_scores_obj.mean();
                cv_scores_list = cv_scores_obj.tolist()
            else:
                print("Skipping CV due to insufficient samples in some classes for 5 splits.")

            self.is_trained = True
            print("Model trained successfully.")
            return {'train_accuracy': train_acc, 'test_accuracy': test_acc, 'cv_mean': cv_scores_mean,
                    'cv_scores': cv_scores_list}
        except Exception as e:
            print(f"Error in train_model: {e}\n{traceback.format_exc()}")
            self.subcategory_medians = {};
            return None

    def predict_platform(self, subcategory, selling_price=None, mrp=None, discount=None, rating=None,
                         rating_count=None):
        print("predict_platform called")
        if not self.is_trained: return {"error": "Model not trained yet"}
        if self.le_subcat is None or self.le_platform is None: return {"error": "Label encoders not available."}
        if not hasattr(self, 'subcategory_medians') or not hasattr(self, 'overall_medians'):
            return {"error": "Internal model data incomplete."}
        try:
            try:
                # Ensure subcategory_encoded is a standard Python int
                subcategory_encoded = int(self.le_subcat.transform([str(subcategory)])[0])
            except ValueError:
                return {"error": f"Unknown subcategory: '{str(subcategory)}'. Not seen in training."}
            except Exception as e:
                return {"error": f"Error encoding subcategory '{str(subcategory)}': {str(e)}"}

            current_sub_medians = self.subcategory_medians.get(str(subcategory), {})  # Use str(subcategory) for lookup

            def get_feature_value(user_val, feature_name):
                if user_val is not None:
                    try:
                        # Attempt to convert to float, handling potential errors
                        return float(user_val)
                    except (ValueError, TypeError):
                        # If conversion fails, fallback to median or default
                        print(f"Warning: Invalid user value for {feature_name}: '{user_val}'. Using median/default.")
                        pass  # Fall through to use medians/default

                val = current_sub_medians.get(feature_name)
                if val is not None and not np.isnan(val): return float(val)  # Explicit float conversion

                overall_val = self.overall_medians.get(feature_name)
                if overall_val is not None and not np.isnan(overall_val): return float(overall_val)  # Explicit float

                print(
                    f"Warning: No median for {feature_name} (subcat '{str(subcategory)}' or overall). Defaulting to 0.0.")
                return 0.0

            sp_to_use = get_feature_value(selling_price, "Selling Price")
            mrp_to_use = get_feature_value(mrp, "MRP")
            disc_to_use = get_feature_value(discount, "Discount")
            rat_to_use = get_feature_value(rating, "Rating")
            rc_to_use = get_feature_value(rating_count, "Rating_Count")

            new_input_data = {
                "Selling Price": float(sp_to_use),
                "MRP": float(mrp_to_use),
                "Discount": float(disc_to_use),
                "Rating": float(rat_to_use),
                "Rating_Count": float(rc_to_use),
                "Subcategory_encoded": int(subcategory_encoded)  # Already int
            }
            new_input_df = pd.DataFrame([new_input_data])
            expected_feature_order = ["Selling Price", "MRP", "Discount", "Rating", "Rating_Count",
                                      "Subcategory_encoded"]
            new_input_df = new_input_df[expected_feature_order]

            prediction_encoded_array = self.model.predict(new_input_df)
            prediction_encoded = int(prediction_encoded_array[0])  # Ensure standard int

            prediction_proba_array = self.model.predict_proba(new_input_df)[0]  # This is a NumPy array

            # Ensure prediction_label is a standard Python string
            prediction_label = str(self.le_platform.inverse_transform([prediction_encoded])[0])

            # Ensure confidence is a Python float
            confidence = float(np.max(prediction_proba_array) * 100)  # Use np.max for clarity if it's a numpy array

            # Ensure probabilities are Python floats and keys are Python strings
            platform_probabilities = {}
            for i in range(len(self.le_platform.classes_)):
                class_label = str(self.le_platform.classes_[i])
                probability = float(round(float(prediction_proba_array[i]) * 100, 2))  # Be very explicit
                platform_probabilities[class_label] = probability

            subcategory_plot_data_for_response = {}
            if self.model_df is not None and 'Subcategory' in self.model_df.columns:
                # Use str(subcategory) for consistency if subcategory might not always be string
                current_subcategory_df = self.model_df[self.model_df['Subcategory'] == str(subcategory)]
                if not current_subcategory_df.empty:
                    if 'Selling Price' in current_subcategory_df.columns:
                        prices_list = current_subcategory_df['Selling Price'].dropna().tolist()
                        subcategory_plot_data_for_response['prices'] = [float(p) for p in prices_list]
                    if 'Rating' in current_subcategory_df.columns:
                        ratings_list = current_subcategory_df['Rating'].dropna().tolist()
                        subcategory_plot_data_for_response['ratings'] = [float(r) for r in ratings_list]

            print("Prediction successful.")

            response_data = {
                "predicted_platform": prediction_label,  # Already str
                "confidence": confidence,  # Already float
                "platform_probabilities": platform_probabilities,  # Values are float, keys are str
                "features_used": new_input_data,  # Values are float/int
                "subcategory_plot_data": subcategory_plot_data_for_response  # Values are lists of floats
            }
            return response_data

        except Exception as e:
            print(f"Error in predict_platform: {e}\n{traceback.format_exc()}")
            return {"error": f"Prediction error: {str(e)}"}

    def get_available_subcategories(self):
        if self.le_subcat is None or not self.is_trained: return []
        return self.le_subcat.classes_.tolist()

    def save_model(self, filepath):
        print(f"save_model called for {filepath}")
        try:
            model_data = {'model': self.model, 'le_platform': self.le_platform, 'le_subcat': self.le_subcat,
                          'is_trained': self.is_trained, 'subcategory_medians': self.subcategory_medians,
                          'overall_medians': self.overall_medians}
            with open(filepath, 'wb') as f:
                pickle.dump(model_data, f)
            return True
        except Exception as e:
            print(f"Error saving model: {e}\n{traceback.format_exc()}");
            return False

    def load_model(self, filepath):
        print(f"load_model called for {filepath}")
        try:
            with open(filepath, 'rb') as f:
                model_data = pickle.load(f)
            self.model = model_data.get('model')
            self.le_platform = model_data.get('le_platform')
            self.le_subcat = model_data.get('le_subcat')
            self.is_trained = model_data.get('is_trained', False)
            self.subcategory_medians = model_data.get('subcategory_medians', {})
            self.overall_medians = model_data.get('overall_medians', {})
            if self.is_trained and (not self.subcategory_medians or not self.overall_medians):
                print("WARNING: Loaded model missing median data. Retrain advised.")
            if self.model is None or self.le_platform is None or self.le_subcat is None:
                print("WARNING: Critical components missing from loaded model. Marking as not trained.")
                self.is_trained = False;
                return False
            return True
        except Exception as e:
            print(f"Error loading model: {e}\n{traceback.format_exc()}");
            self.__init__();
            return False


predictor = PlatformPredictor()


@app.route('/train_model', methods=['POST'])
def train_model_route():
    if 'user_id' not in session:  # PROTECTED
        return jsonify({"error": "Authentication required to train model."}), 401
    try:
        csv_path = request.json.get('csv_path', DATASET_CSV_FILE)
        if not os.path.exists(csv_path):
            return jsonify({"error": f"CSV file not found: {csv_path}"}), 400
        df = predictor.load_and_prepare_data(csv_path)
        if df is None: return jsonify({"error": "Failed to load or prepare data"}), 400
        results = predictor.train_model(df)
        if results is None: return jsonify({"error": "Failed to train model"}), 500

        session['last_training_results'] = results  # Store for analytics

        msg = "Model trained" + (" and saved." if predictor.save_model(MODEL_PKL_FILE) else " BUT FAILED TO SAVE.")
        return jsonify({"success": True, "message": msg, "results": results,
                        "subcategories": predictor.get_available_subcategories()})
    except Exception as e:
        print(f"Error in /train_model route: {e}\n{traceback.format_exc()}");
        return jsonify({"error": f"Training failed: {str(e)}"}), 500


@app.route('/predict', methods=['POST'])
def predict_route():  # Kept your original name
    if 'user_id' not in session:  # PROTECTED
        return jsonify({"error": "Authentication required for prediction."}), 401
    try:
        data = request.json
        if not predictor.is_trained:
            print("/predict: Model not trained. Attempting load.")
            if os.path.exists(MODEL_PKL_FILE):
                if not predictor.load_model(MODEL_PKL_FILE) or not predictor.is_trained:
                    return jsonify({"error": "Failed to load model or model incomplete. Retrain."}), 500
            else:
                return jsonify({"error": "Model not trained and no saved model. Train first."}), 400

        if not predictor.is_trained:  # Re-check
            return jsonify({"error": "Model not available. Train first."}), 400

        subcategory = data.get('subcategory')
        if not subcategory: return jsonify({"error": "Subcategory is required."}), 400

        result = predictor.predict_platform(
            subcategory=subcategory, selling_price=data.get('selling_price'),
            mrp=data.get('mrp'), discount=data.get('discount'),
            rating=data.get('rating'), rating_count=data.get('rating_count')
        )
        return jsonify(result)
    except Exception as e:
        print(f"Error in /predict route: {e}\n{traceback.format_exc()}");
        return jsonify({"error": f"Prediction request failed: {str(e)}"}), 500


@app.route('/get_subcategories')
def get_subcategories_route():
    if 'user_id' not in session:  # PROTECTED if list is sensitive
        return jsonify({"error": "Authentication required."}), 401
    try:
        if not predictor.is_trained and os.path.exists(MODEL_PKL_FILE):
            if not predictor.load_model(MODEL_PKL_FILE):
                return jsonify({"error": "Failed to load model for subcategories"}), 500
        return jsonify({"subcategories": predictor.get_available_subcategories()})
    except Exception as e:
        print(f"Error in /get_subcategories: {e}\n{traceback.format_exc()}");
        return jsonify({"error": f"Failed to get subcategories: {str(e)}"}), 500


@app.route('/status')
def status_route():  # Typically public
    model_is_ready = predictor.is_trained
    if not model_is_ready and os.path.exists(MODEL_PKL_FILE):
        temp_predictor = PlatformPredictor()
        if temp_predictor.load_model(MODEL_PKL_FILE) and temp_predictor.is_trained:
            model_is_ready = True

    return jsonify({
        "model_trained": model_is_ready,  # Changed key to match JS expectation
        "model_file_exists": os.path.exists(MODEL_PKL_FILE),
        "csv_file_exists": os.path.exists(DATASET_CSV_FILE)
    })


@app.route('/api/analytics_data')
def get_analytics_data_route():  # Kept your original name
    if 'user_id' not in session:  # PROTECTED
        return jsonify({"error": "Authentication required for analytics."}), 401
    try:
        if not predictor.is_trained or predictor.model_df is None:
            print("Analytics: model not trained/df missing. Attempting load.")
            if os.path.exists(MODEL_PKL_FILE) and predictor.load_model(MODEL_PKL_FILE) and predictor.is_trained:
                if predictor.model_df is None and os.path.exists(DATASET_CSV_FILE):
                    predictor.load_and_prepare_data(DATASET_CSV_FILE)
            if not predictor.is_trained or predictor.model_df is None:
                return jsonify({"error": "Model or analytics data not available. Train/retrain."}), 400

        df_an = predictor.model_df  # Renamed for brevity
        p_counts = df_an['Platform'].value_counts().to_dict() if 'Platform' in df_an else {}
        s_counts = df_an['Subcategory'].value_counts().nlargest(10).to_dict() if 'Subcategory' in df_an else {}
        sc_data = []
        if all(col in df_an.columns for col in ["Selling Price", "Rating"]):
            v_df = df_an[["Selling Price", "Rating"]].dropna()
            if not v_df.empty:
                s_size = min(100, len(v_df))
                s_df = v_df.sample(n=s_size, random_state=1, replace=len(v_df) < s_size)
                sc_data = [{"price": r["Selling Price"], "rating": r["Rating"]} for i, r in s_df.iterrows()]

        return jsonify({
            "platform_distribution": {"platforms": list(p_counts.keys()), "counts": list(p_counts.values())},
            "subcategory_usage": {"subcategories": list(s_counts.keys()), "counts": list(s_counts.values())},
            "price_rating_scatter": sc_data,
            "training_results": session.get('last_training_results', None)
        })
    except Exception as e:
        print(f"Error /api/analytics_data: {e}\n{traceback.format_exc()}");
        return jsonify({"error": f"Failed: {str(e)}"}), 500


# --- App Startup ---
if __name__ == '__main__':
    if os.path.exists(MODEL_PKL_FILE):
        try:
            os.remove(MODEL_PKL_FILE)
            print(f"'{MODEL_PKL_FILE}' found and deleted. Model will need to be trained in this session.")
        except Exception as e:
            print(f"Error deleting existing '{MODEL_PKL_FILE}': {e}. Manual deletion might be required.")
    else:
        print(f"No pre-existing '{MODEL_PKL_FILE}' found. Model will need to be trained.")

    # The global 'predictor' object is already initialized when the class is defined.
    # Its 'is_trained' flag will be False, and median dictionaries will be empty.

    print(f"\n🚀 Starting Platform Predictor App...")
    # Ensure PORT is correctly sourced or defaulted
    app.run(port=8080, debug=False)
