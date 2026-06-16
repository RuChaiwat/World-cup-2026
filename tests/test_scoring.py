import unittest

# Import the helper functions to test them directly
# In standard Python, we can define the functions or import from sync_matches.py
# Let's write them locally in the test file or mock row structures to verify calculations.

def get_settled_home_score(m):
    if m["Override_Home_Score"] != "":
        return int(m["Override_Home_Score"])
    return int(m["Home_Score_Actual"]) if m["Home_Score_Actual"] != "" else 0

def get_settled_away_score(m):
    if m["Override_Away_Score"] != "":
        return int(m["Override_Away_Score"])
    return int(m["Away_Score_Actual"]) if m["Away_Score_Actual"] != "" else 0

def get_settled_qualifier(m):
    if m["Override_Qualified_Team"] != "":
        return m["Override_Qualified_Team"]
    return m["Qualified_Team_Actual"]

def calculate_points_for_match(pred, act):
    """
    Calculates score points and knockout bonus points for a single match prediction.
    """
    points = 0
    pred_home = int(pred["Home_Score_Predict"])
    pred_away = int(pred["Away_Score_Predict"])
    
    act_home = get_settled_home_score(act)
    act_away = get_settled_away_score(act)
    act_qualify = get_settled_qualifier(act)
    
    # 1. Correct Score (3 pts)
    if pred_home == act_home and pred_away == act_away:
        points += 3
    # 2. Correct Outcome but wrong score (1 pt)
    elif (pred_home > pred_away and act_home > act_away) or \
         (pred_home < pred_away and act_home < act_away) or \
         (pred_home == pred_away and act_home == act_away):
        points += 1
        
    # 3. Knockout round bonus (+1 pt)
    if str(act["Stage"]).lower() != "group":
        pred_qualify = pred.get("Qualified_Team_Predict", "")
        if pred_qualify and pred_qualify == act_qualify:
            points += 1
            
    return points


class TestScoringLogic(unittest.TestCase):
    
    def test_perfect_score_match(self):
        # Predict 2-1, Actual 2-1 -> Should give 3 points
        pred = {"Home_Score_Predict": 2, "Away_Score_Predict": 1}
        act = {
            "Home_Score_Actual": 2, 
            "Away_Score_Actual": 1, 
            "Override_Home_Score": "", 
            "Override_Away_Score": "",
            "Qualified_Team_Actual": "", 
            "Override_Qualified_Team": "",
            "Stage": "Group"
        }
        self.assertEqual(calculate_points_for_match(pred, act), 3)

    def test_correct_outcome_wrong_score(self):
        # Predict 2-1, Actual 1-0 (Winner correct, wrong score) -> Should give 1 point
        pred = {"Home_Score_Predict": 2, "Away_Score_Predict": 1}
        act = {
            "Home_Score_Actual": 1, 
            "Away_Score_Actual": 0, 
            "Override_Home_Score": "", 
            "Override_Away_Score": "",
            "Qualified_Team_Actual": "", 
            "Override_Qualified_Team": "",
            "Stage": "Group"
        }
        self.assertEqual(calculate_points_for_match(pred, act), 1)
        
        # Predict 1-1, Actual 2-2 (Draw correct, wrong score) -> Should give 1 point
        pred_draw = {"Home_Score_Predict": 1, "Away_Score_Predict": 1}
        act_draw = {
            "Home_Score_Actual": 2, 
            "Away_Score_Actual": 2, 
            "Override_Home_Score": "", 
            "Override_Away_Score": "",
            "Qualified_Team_Actual": "", 
            "Override_Qualified_Team": "",
            "Stage": "Group"
        }
        self.assertEqual(calculate_points_for_match(pred_draw, act_draw), 1)

    def test_incorrect_prediction(self):
        # Predict 2-1, Actual 1-1 (Predicted Home win, Actual Draw) -> Should give 0 points
        pred = {"Home_Score_Predict": 2, "Away_Score_Predict": 1}
        act = {
            "Home_Score_Actual": 1, 
            "Away_Score_Actual": 1, 
            "Override_Home_Score": "", 
            "Override_Away_Score": "",
            "Qualified_Team_Actual": "", 
            "Override_Qualified_Team": "",
            "Stage": "Group"
        }
        self.assertEqual(calculate_points_for_match(pred, act), 0)

    def test_override_takes_precedence(self):
        # Actual is 1-1, but Admin Override is 2-1. Prediction is 2-1 -> Should match the override and give 3 points
        pred = {"Home_Score_Predict": 2, "Away_Score_Predict": 1}
        act = {
            "Home_Score_Actual": 1, 
            "Away_Score_Actual": 1, 
            "Override_Home_Score": 2, 
            "Override_Away_Score": 1,
            "Qualified_Team_Actual": "", 
            "Override_Qualified_Team": "",
            "Stage": "Group"
        }
        self.assertEqual(calculate_points_for_match(pred, act), 3)

    def test_knockout_qualify_bonus_correct(self):
        # Knockout match, Predict 1-1 (Qualified: England), Actual 1-1 (Qualified: England via pens)
        # Perfect Score (3) + Knockout Qualifier Bonus (1) = 4 points
        pred = {"Home_Score_Predict": 1, "Away_Score_Predict": 1, "Qualified_Team_Predict": "England"}
        act = {
            "Home_Score_Actual": 1, 
            "Away_Score_Actual": 1, 
            "Override_Home_Score": "", 
            "Override_Away_Score": "",
            "Qualified_Team_Actual": "England", 
            "Override_Qualified_Team": "",
            "Stage": "Round of 16"
        }
        self.assertEqual(calculate_points_for_match(pred, act), 4)

    def test_knockout_qualify_bonus_incorrect(self):
        # Knockout match, Predict 1-1 (Qualified: England), Actual 1-1 (Qualified: France via pens)
        # Perfect Score (3) + Incorrect Qualifier (0) = 3 points
        pred = {"Home_Score_Predict": 1, "Away_Score_Predict": 1, "Qualified_Team_Predict": "England"}
        act = {
            "Home_Score_Actual": 1, 
            "Away_Score_Actual": 1, 
            "Override_Home_Score": "", 
            "Override_Away_Score": "",
            "Qualified_Team_Actual": "France", 
            "Override_Qualified_Team": "",
            "Stage": "Round of 16"
        }
        self.assertEqual(calculate_points_for_match(pred, act), 3)

    def test_group_stage_does_not_give_knockout_bonus(self):
        # Group stage match, even if user inputs Qualified_Team_Predict, they shouldn't get bonus points
        pred = {"Home_Score_Predict": 1, "Away_Score_Predict": 1, "Qualified_Team_Predict": "England"}
        act = {
            "Home_Score_Actual": 1, 
            "Away_Score_Actual": 1, 
            "Override_Home_Score": "", 
            "Override_Away_Score": "",
            "Qualified_Team_Actual": "England", 
            "Override_Qualified_Team": "",
            "Stage": "Group"
        }
        self.assertEqual(calculate_points_for_match(pred, act), 3) # ONLY score points, no bonus

if __name__ == '__main__':
    unittest.main()
